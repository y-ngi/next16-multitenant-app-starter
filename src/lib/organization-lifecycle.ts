import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq, and, gt } from 'drizzle-orm';
import { organization, membership, user, invitation, type OrganizationRole, type InvitationStatus } from '@/db/schema';
import { randomUUID } from 'crypto';
import { requireOrganizationAccess } from '@/lib/organization-authz';
import { sendInvitationEmail, sendAcceptanceNotificationEmail } from '@/lib/invitation-mailer';

export interface CreateOrganizationInput {
  readonly headers: Headers;
  readonly name: string;
  readonly slug: string;
}

export interface CreateOrganizationResult {
  readonly ok: boolean;
  readonly organization?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly error?: string;
}

/**
 * Server-only function to create a new organization with the authenticated user as owner.
 * Performs within a transaction to ensure both organization and membership are created together.
 */
export async function createOrganization(
  input: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  const { headers, name, slug } = input;

  // 1. Validate authentication
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user) {
    console.error('[createOrganization] Unauthenticated user attempted to create organization');
    return {
      ok: false,
      error: 'Unauthenticated user cannot create organization',
    };
  }

  const userId = session.user.id;

  // 2. Validate input
  if (!name || name.trim() === '') {
    console.error('[createOrganization] Validation failed: Organization name is required');
    return {
      ok: false,
      error: 'Organization name is required',
    };
  }

  if (!slug || slug.trim() === '') {
    console.error('[createOrganization] Validation failed: Organization slug is required');
    return {
      ok: false,
      error: 'Organization slug is required',
    };
  }

  try {
    // 3. Check slug uniqueness via select
    const normalizedSlug = slug.trim().toLowerCase();
    const existingOrgs = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, normalizedSlug))
      .limit(1);

    if (existingOrgs.length > 0) {
      console.warn(`[createOrganization] Duplicate slug requested: ${normalizedSlug}`);
      return {
        ok: false,
        error: '指定された組織タグは既に使用されています。別のタグを指定してください。',
      };
    }

    // 4. Create organization and membership within a transaction
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const orgId = randomUUID();

      // Insert organization
      const orgResult = await tx
        .insert(organization)
        .values({
          id: orgId,
          name: name.trim(),
          slug: normalizedSlug,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!orgResult || orgResult.length === 0) {
        throw new Error('Failed to create organization');
      }

      const createdOrg = orgResult[0];

      // Insert membership with owner role
      const membershipId = randomUUID();
      const memberResult = await tx
        .insert(membership)
        .values({
          id: membershipId,
          organizationId: orgId,
          userId,
          role: 'owner' as OrganizationRole,
          createdAt: now,
        })
        .returning();

      if (!memberResult || memberResult.length === 0) {
        throw new Error('Failed to create membership');
      }

      return createdOrg;
    });

    console.log(`[createOrganization] Successfully created organization: ${result.name} (${result.id})`);
    return {
      ok: true,
      organization: {
        id: result.id,
        name: result.name,
        slug: result.slug,
      },
    };
  } catch (error) {
    console.error('[createOrganization] Error during organization creation:', error);
    if (error instanceof Error && error.message.includes('organization_slug_unique')) {
      return {
        ok: false,
        error: '指定された組織タグは既に使用されています。別のタグを指定してください。',
      };
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to create organization';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

export interface GetUserOrganizationsInput {
  readonly headers: Headers;
}

export interface GetUserOrganizationsResult {
  readonly ok: boolean;
  readonly organizations?: Array<{
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly role: OrganizationRole;
    readonly joinedAt: Date;
  }>;
  readonly error?: string;
}

/**
 * Get all organizations that the authenticated user belongs to.
 */
export async function getUserOrganizations(
  input: GetUserOrganizationsInput
): Promise<GetUserOrganizationsResult> {
  const { headers } = input;

  // 1. Validate authentication
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user) {
    console.error('[getUserOrganizations] Unauthenticated request');
    return {
      ok: false,
      error: 'Unauthenticated',
    };
  }

  const userId = session.user.id;

  try {
    // 2. Fetch organizations for the user via innerJoin
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
        joinedAt: membership.createdAt,
      })
      .from(membership)
      .innerJoin(organization, eq(membership.organizationId, organization.id))
      .where(eq(membership.userId, userId));

    return {
      ok: true,
      organizations: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: r.role as OrganizationRole,
        joinedAt: r.joinedAt,
      })),
    };
  } catch (error) {
    console.error('[getUserOrganizations] Database error fetching user organizations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch organizations';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

export interface GetOrganizationMembersInput {
  readonly headers: Headers;
  readonly organizationId: string;
}

export interface GetOrganizationMembersResult {
  readonly ok: boolean;
  readonly members?: Array<{
    readonly id: string;
    readonly userId: string;
    readonly userName: string;
    readonly userEmail: string;
    readonly displayName?: string | null;
    readonly role: OrganizationRole;
    readonly joinedAt: Date;
  }>;
  readonly error?: string;
}

/**
 * Get all members of an organization (only accessible to organization members).
 */
export async function getOrganizationMembers(
  input: GetOrganizationMembersInput
): Promise<GetOrganizationMembersResult> {
  const { headers, organizationId } = input;

  try {
    // 1. Check authorization - user must be a member of the organization
    const authResult = await requireOrganizationAccess({
      headers,
      organizationId,
      requiredRole: 'member',
    });

    if (!authResult.ok) {
      let errorMessage = 'Unauthorized';
      if (authResult.reason === 'unauthenticated') {
        errorMessage = 'Unauthenticated';
      } else if (authResult.reason === 'not-member') {
        errorMessage = 'Not a member of this organization';
      } else if (authResult.reason === 'organization-not-found') {
        errorMessage = 'Organization not found';
      } else if (authResult.reason === 'insufficient-role') {
        errorMessage = 'Insufficient role to access this organization';
      }
      console.warn(`[getOrganizationMembers] Authorization failed for org ${organizationId}: ${errorMessage}`);
      return {
        ok: false,
        error: errorMessage,
      };
    }

    // 2. Fetch all members via innerJoin
    const rows = await db
      .select({
        id: membership.id,
        userId: membership.userId,
        userName: user.name,
        userEmail: user.email,
        displayName: membership.displayName,
        role: membership.role,
        joinedAt: membership.createdAt,
      })
      .from(membership)
      .innerJoin(user, eq(membership.userId, user.id))
      .where(eq(membership.organizationId, organizationId));

    return {
      ok: true,
      members: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        displayName: r.displayName,
        role: r.role as OrganizationRole,
        joinedAt: r.joinedAt,
      })),
    };
  } catch (error) {
    console.error(`[getOrganizationMembers] Error fetching members for org ${organizationId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch members';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

export interface CreateInvitationInput {
  readonly headers: Headers;
  readonly organizationId: string;
  readonly email: string;
  readonly baseURL: string;
}

export interface CreateInvitationResult {
  readonly ok: boolean;
  readonly invitation?: {
    readonly id: string;
    readonly email: string;
    readonly status: InvitationStatus;
    readonly token: string;
    readonly inviteLink: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
  };
  readonly mailSent?: boolean;
  readonly error?: string;
}

export interface ValidateTokenResult {
  readonly valid: boolean;
  readonly reason?: 'not-found' | 'expired' | 'already-used' | 'canceled';
  readonly invitation?: {
    readonly id: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly email: string;
    readonly role: OrganizationRole;
  };
}

export interface RespondToInvitationInput {
  readonly headers: Headers;
  readonly token: string;
  readonly accept: boolean;
}

/**
 * Server-only helper to check whether an email address already has a
 * registered user account. Used to route invitation emails and the
 * invitation acceptance screen to either the login or signup flow.
 */
export async function checkEmailHasAccount(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return rows.length > 0;
}

/**
 * Server-only function to validate an invitation token.
 * Returns validation result with details about the invitation status.
 * Distinguishes between different invalid states: not-found, expired, already-used, and canceled.
 */
export async function validateInvitationToken(token: string): Promise<ValidateTokenResult> {
  try {
    // 1. Find invitation by token
    const invRecords = await db
      .select()
      .from(invitation)
      .where(eq(invitation.token, token))
      .limit(1);

    if (invRecords.length === 0) {
      return {
        valid: false,
        reason: 'not-found',
      };
    }

    const inv = invRecords[0];

    // 2. Check invitation status
    if (inv.status === 'canceled') {
      return {
        valid: false,
        reason: 'canceled',
      };
    }

    if (inv.status === 'accepted' || inv.status === 'rejected') {
      return {
        valid: false,
        reason: 'already-used',
      };
    }

    // 3. Check expiration (expiresAt < now means expired)
    const now = new Date();
    if (inv.expiresAt < now) {
      return {
        valid: false,
        reason: 'expired',
      };
    }

    // 4. Valid invitation: status is 'pending' and not expired
    // Fetch organization name
    const orgRecords = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, inv.organizationId))
      .limit(1);

    if (orgRecords.length === 0) {
      // Organization not found (should not happen in normal flow)
      return {
        valid: false,
        reason: 'not-found',
      };
    }

    return {
      valid: true,
      invitation: {
        id: inv.id,
        organizationId: inv.organizationId,
        organizationName: orgRecords[0].name,
        email: inv.email,
        role: inv.role as OrganizationRole,
      },
    };
  } catch (error) {
    console.error('[validateInvitationToken] Error validating token:', error);
    // On error, treat as not-found
    return {
      valid: false,
      reason: 'not-found',
    };
  }
}

/**
 * Server-only function to create an invitation for a user to join an organization.
 * Only organization owners can create invitations.
 * If an invitation already exists for this email, it is canceled and a new one is issued.
 * If sending the notification email fails, the invitation remains pending.
 */
export async function createInvitation(
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const { headers, organizationId, email, baseURL } = input;

  try {
    // 1. Check authorization (only owner can invite)
    const authz = await requireOrganizationAccess({
      headers,
      organizationId,
      requiredRole: 'owner',
    });

    if (!authz.ok) {
      const errorMsg =
        authz.reason === 'insufficient-role' ? 'Only organization owners can create invitations'
        : authz.reason === 'unauthenticated' ? 'Unauthenticated'
        : authz.reason === 'organization-not-found' ? 'Organization not found'
        : 'Not a member of this organization';
      console.warn(`[createInvitation] Authorization failed for org ${organizationId}: ${errorMsg}`);
      return { ok: false, error: errorMsg };
    }

    const userId = authz.userId;

    // 2. Check if the email is already a member of the organization
    const existingMemberRows = await db
      .select({ email: user.email })
      .from(membership)
      .innerJoin(user, eq(membership.userId, user.id))
      .where(and(eq(membership.organizationId, organizationId), eq(user.email, email)))
      .limit(1);

    if (existingMemberRows.length > 0) {
      return { ok: false, error: '既に組織に所属しています' };
    }

    // 3. Check for existing pending invitation and cancel it
    const existingInvitations = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.email, email),
          eq(invitation.status, 'pending' as InvitationStatus),
        )
      )
      .limit(1);

    if (existingInvitations.length > 0) {
      // Cancel the existing invitation
      await db
        .update(invitation)
        .set({ status: 'canceled' as InvitationStatus, updatedAt: new Date() })
        .where(eq(invitation.id, existingInvitations[0].id));
    }

    // 4. Create new invitation
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
    const token = randomUUID();
    const invitationId = randomUUID();

    const newInvitation = await db
      .insert(invitation)
      .values({
        id: invitationId,
        organizationId,
        email,
        role: 'member' as OrganizationRole,
        token,
        status: 'pending' as InvitationStatus,
        inviterId: userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!newInvitation || newInvitation.length === 0) {
      throw new Error('Failed to create invitation record');
    }

    const createdInvitation = newInvitation[0];

    // 5. Get inviter name and organization name for the email
    const inviterUsers = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const orgs = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    const inviterName = inviterUsers[0]?.name || 'Team Member';
    const organizationName = orgs[0]?.name || 'Organization';

    // 6. Determine whether the invitee already has an account. This is used
    // to tailor the email copy/CTA label only — the link itself always
    // points to the invitation acceptance screen so that an invitee who is
    // already logged in with the matching email can accept/reject directly,
    // without being forced through a re-login step.
    const isExistingUser = await checkEmailHasAccount(email);

    // 7. Send invitation email
    const inviteLink = `${baseURL}/invitations/accept?token=${token}`;
    const mailSent = await sendInvitationEmail({
      toEmail: email,
      organizationName,
      inviterName,
      actionLink: inviteLink,
      isExistingUser,
    });

    // 7. Return invitation with mail status
    return {
      ok: true,
      invitation: {
        id: createdInvitation.id,
        email: createdInvitation.email,
        status: createdInvitation.status as InvitationStatus,
        token: createdInvitation.token,
        inviteLink,
        expiresAt: createdInvitation.expiresAt,
        createdAt: createdInvitation.createdAt,
      },
      mailSent,
    };
  } catch (error) {
    console.error(`[createInvitation] Error creating invitation for org ${organizationId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create invitation';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

/**
 * Server-only function to respond to an invitation (accept or reject).
 * Only the invited user (matching email) can accept or reject the invitation.
 * On acceptance: creates membership and sends notification email to inviter.
 * On rejection: does not create membership, just updates invitation status.
 * If email notification fails on acceptance, does not fail the operation (logs error).
 */
export async function respondToInvitation(
  input: RespondToInvitationInput
): Promise<{
  readonly ok: boolean;
  readonly error?: string;
}> {
  const { headers, token, accept } = input;

  try {
    // 1. Validate authentication
    const session = await auth.api.getSession({ headers });
    if (!session || !session.user) {
      console.error('[respondToInvitation] Unauthenticated request');
      return {
        ok: false,
        error: 'Unauthenticated user cannot respond to invitation',
      };
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // 2. Find invitation by token
    const invRecords = await db
      .select()
      .from(invitation)
      .where(eq(invitation.token, token))
      .limit(1);

    if (invRecords.length === 0) {
      console.warn(`[respondToInvitation] Invitation token not found: ${token}`);
      return {
        ok: false,
        error: 'Invitation not found',
      };
    }

    const inv = invRecords[0];

    // 3. Validate invitation status and expiration
    if (inv.status === 'canceled') {
      return {
        ok: false,
        error: 'Invitation has been canceled',
      };
    }

    if (inv.status === 'accepted' || inv.status === 'rejected') {
      return {
        ok: false,
        error: 'Invitation has already been used',
      };
    }

    // 4. Check expiration (expiresAt < now means expired)
    const now = new Date();
    if (inv.expiresAt < now) {
      return {
        ok: false,
        error: 'Invitation has expired',
      };
    }

    // 5. Verify email matches
    if (userEmail !== inv.email) {
      console.warn(`[respondToInvitation] Email mismatch: logged in as ${userEmail}, invited ${inv.email}`);
      return {
        ok: false,
        error: '他のユーザへの招待ですので、招待されたメールアドレスで再ログインしてください。',
      };
    }

    // 6. Handle acceptance
    if (accept) {
      // Create membership and update invitation within a transaction.
      // Lock all membership rows for the organization first (same order as
      // deleteOrganization's owner-count guard: membership rows -> organization),
      // instead of locking the organization row directly. deleteOrganization
      // locks every membership row for the org before deleting the organization
      // (whose ON DELETE CASCADE removes the invitation row); if this path
      // instead locked the organization row first and then touched membership
      // via the insert's unique-constraint check, the two transactions could
      // wait on each other in opposite orders and deadlock. Locking the same
      // membership rows first here establishes one consistent lock order.
      // The invitation status update is conditioned on the invitation still
      // being 'pending' and not expired at commit time, and its affected-row
      // count is checked: this closes a race where a concurrent
      // cancelInvitation (service: organization-member-management) commits
      // 'canceled', or the invitation's expiresAt passes, between the initial
      // read above and this transaction, which would otherwise let acceptance
      // silently overwrite the canceled/expired status back to 'accepted'.
      let invitationFailureReason: 'already-used' | 'expired' | null = null;

      await db.transaction(async (tx) => {
        const membershipId = randomUUID();
        const createdAt = new Date();

        await tx
          .select({ id: membership.id })
          .from(membership)
          .where(eq(membership.organizationId, inv.organizationId))
          .for('update');

        const updateAt = new Date();
        const updatedInvitations = await tx
          .update(invitation)
          .set({
            status: 'accepted' as InvitationStatus,
            updatedAt: updateAt,
          })
          .where(
            and(
              eq(invitation.id, inv.id),
              eq(invitation.status, 'pending'),
              gt(invitation.expiresAt, updateAt)
            )
          )
          .returning({ id: invitation.id });

        if (updatedInvitations.length === 0) {
          const [currentInvitation] = await tx
            .select({ status: invitation.status, expiresAt: invitation.expiresAt })
            .from(invitation)
            .where(eq(invitation.id, inv.id))
            .limit(1);

          invitationFailureReason =
            currentInvitation && currentInvitation.expiresAt < updateAt ? 'expired' : 'already-used';
          return;
        }

        // Create membership with role from invitation
        await tx
          .insert(membership)
          .values({
            id: membershipId,
            organizationId: inv.organizationId,
            userId,
            role: inv.role as OrganizationRole,
            createdAt,
          });
      });

      if (invitationFailureReason === 'expired') {
        return {
          ok: false,
          error: 'Invitation has expired',
        };
      }

      if (invitationFailureReason === 'already-used') {
        return {
          ok: false,
          error: 'Invitation has already been used',
        };
      }

      // 7. Get inviter info and send acceptance notification email
      const inviterUsers = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, inv.inviterId))
        .limit(1);

      const orgs = await db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, inv.organizationId))
        .limit(1);

      if (inviterUsers.length > 0 && orgs.length > 0) {
        // Send notification email (do not fail if email fails)
        await sendAcceptanceNotificationEmail({
          toEmail: inviterUsers[0].email,
          organizationName: orgs[0].name,
          newMemberName: session.user.name || 'Team Member',
          newMemberEmail: inv.email,
        }).catch((error) => {
          console.error('[Acceptance Notification Email] メール送信失敗:', error);
          // Do not throw, just log
        });
      }

      return {
        ok: true,
      };
    } else {
      // 8. Handle rejection - update invitation status conditionally on it
      // still being pending and unexpired at commit time. Without this
      // condition, a concurrent cancelInvitation (service:
      // organization-member-management) that commits 'canceled' between the
      // initial read above and this update would be silently overwritten
      // back to 'rejected' by an unconditional update keyed only on `id`.
      const rejectedAt = new Date();
      const rejectedInvitations = await db
        .update(invitation)
        .set({
          status: 'rejected' as InvitationStatus,
          updatedAt: rejectedAt,
        })
        .where(
          and(
            eq(invitation.id, inv.id),
            eq(invitation.status, 'pending'),
            gt(invitation.expiresAt, rejectedAt)
          )
        )
        .returning({ id: invitation.id });

      if (rejectedInvitations.length === 0) {
        const [currentInvitation] = await db
          .select({ status: invitation.status, expiresAt: invitation.expiresAt })
          .from(invitation)
          .where(eq(invitation.id, inv.id))
          .limit(1);

        return {
          ok: false,
          error:
            currentInvitation && currentInvitation.expiresAt < rejectedAt
              ? 'Invitation has expired'
              : 'Invitation has already been used',
        };
      }

      return {
        ok: true,
      };
    }
  } catch (error) {
    console.error('[respondToInvitation] Error responding to invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to respond to invitation';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

export interface GetInvitationsInput {
  readonly headers: Headers;
  readonly organizationId: string;
}

export interface GetInvitationsResult {
  readonly ok: boolean;
  readonly invitations?: Array<{
    readonly id: string;
    readonly email: string;
    readonly role: string;
    readonly status: string;
    readonly inviteLink: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }>;
  readonly error?: string;
}

/**
 * Server-only function to get all invitations for an organization.
 * Only organization owners can retrieve the invitation list.
 * 
 * The function calculates effective invitation status:
 * - If DB status is 'pending' and expiresAt < now, returns 'expired' (without updating DB)
 * - Otherwise returns DB status as-is
 * 
 * The inviteLink is constructed as: ${baseURL}/invitations/accept?token=${token}
 * where baseURL is extracted from the request headers (Origin).
 */
export async function getInvitations(
  input: GetInvitationsInput
): Promise<GetInvitationsResult> {
  const { headers, organizationId } = input;

  try {
    // 1. Check authorization (only owner can retrieve invitations)
    const authz = await requireOrganizationAccess({
      headers,
      organizationId,
      requiredRole: 'owner',
    });

    if (!authz.ok) {
      const errorMsg =
        authz.reason === 'insufficient-role' ? 'Only organization owners can view invitations'
        : authz.reason === 'unauthenticated' ? 'Unauthenticated'
        : authz.reason === 'organization-not-found' ? 'Organization not found'
        : 'Not a member of this organization';
      console.warn(`[getInvitations] Authorization failed for org ${organizationId}: ${errorMsg}`);
      return { ok: false, error: errorMsg };
    }

    // 2. Extract baseURL from headers (Origin header)
    const origin = headers.get('origin') || headers.get('referer');
    let baseURL = 'https://localhost:3000'; // Default fallback
    if (origin) {
      try {
        const url = new URL(origin);
        baseURL = url.origin;
      } catch {
        // If Origin parsing fails, use default
      }
    }

    // 3. Fetch all invitations for the organization
    const invitations = await db
      .select()
      .from(invitation)
      .where(eq(invitation.organizationId, organizationId));

    // 4. Calculate effective status and build response
    const now = new Date();
    const result = invitations.map((inv) => {
      // Calculate effective status
      let effectiveStatus = inv.status;
      if (inv.status === 'pending' && inv.expiresAt < now) {
        effectiveStatus = 'expired' as InvitationStatus;
      }

      // Construct inviteLink
      const inviteLink = `${baseURL}/invitations/accept?token=${inv.token}`;

      return {
        id: inv.id,
        email: inv.email,
        role: inv.role as string,
        status: effectiveStatus as string,
        inviteLink,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      };
    });

    return {
      ok: true,
      invitations: result,
    };
  } catch (error) {
    console.error(`[getInvitations] Error fetching invitations for org ${organizationId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch invitations';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}
