import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
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
    return {
      ok: false,
      error: 'Unauthenticated user cannot create organization',
    };
  }

  const userId = session.user.id;

  // 2. Validate input
  if (!name || name.trim() === '') {
    return {
      ok: false,
      error: 'Organization name is required',
    };
  }

  if (!slug || slug.trim() === '') {
    return {
      ok: false,
      error: 'Organization slug is required',
    };
  }

  try {
    // 3. Create organization and membership within a transaction
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const orgId = randomUUID();

      // Insert organization
      const orgResult = await tx
        .insert(organization)
        .values({
          id: orgId,
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
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

    return {
      ok: true,
      organization: {
        id: result.id,
        name: result.name,
        slug: result.slug,
      },
    };
  } catch (error) {
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
    return {
      ok: false,
      error: 'Unauthenticated',
    };
  }

  const userId = session.user.id;

  try {
    // 2. Fetch organizations for the user
    const orgs = await db.query.membership.findMany({
      where: eq(membership.userId, userId),
      with: {
        organization: true,
      },
    });

    return {
      ok: true,
      organizations: orgs.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role as OrganizationRole,
        joinedAt: m.createdAt,
      })),
    };
  } catch (error) {
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

  // 1. Validate authentication
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user) {
    return {
      ok: false,
      error: 'Unauthenticated',
    };
  }

  const userId = session.user.id;

  try {
    // 2. Check if user is a member of the organization
    const userMembership = await db.query.membership.findFirst({
      where: and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)),
    });

    if (!userMembership) {
      return {
        ok: false,
        error: 'Not a member of this organization',
      };
    }

    // 3. Fetch all members
    const members = await db.query.membership.findMany({
      where: eq(membership.organizationId, organizationId),
      with: {
        user: true,
      },
    });

    return {
      ok: true,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.user.name,
        userEmail: m.user.email,
        displayName: m.displayName,
        role: m.role as OrganizationRole,
        joinedAt: m.createdAt,
      })),
    };
  } catch (error) {
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
 * Server-only function to validate an invitation token.
 * Returns validation result with details about the invitation status.
 * Distinguishes between different invalid states: not-found, expired, already-used, and canceled.
 */
export async function validateInvitationToken(token: string): Promise<ValidateTokenResult> {
  try {
    // 1. Find invitation by token
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.token, token),
    });

    if (!inv) {
      return {
        valid: false,
        reason: 'not-found',
      };
    }

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
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, inv.organizationId),
    });

    if (!org) {
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
        organizationName: org.name,
        email: inv.email,
        role: inv.role as OrganizationRole,
      },
    };
  } catch (error) {
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
      return { ok: false, error: errorMsg };
    }

    const userId = authz.userId;

    // 2. Check if the email is already a member of the organization
    // Get all memberships with their user info
    const existingMembers = await db.query.membership.findMany({
      where: eq(membership.organizationId, organizationId),
      with: {
        user: true,
      },
    });

    const alreadyMember = existingMembers.some((m) => m.user.email === email);
    if (alreadyMember) {
      return { ok: false, error: '既に組織に所属しています' };
    }

    // 3. Check for existing pending invitation and cancel it
    const existingInvitation = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.email, email),
        eq(invitation.status, 'pending' as InvitationStatus),
      ),
    });

    if (existingInvitation) {
      // Cancel the existing invitation
      await db
        .update(invitation)
        .set({ status: 'canceled' as InvitationStatus, updatedAt: new Date() })
        .where(eq(invitation.id, existingInvitation.id));
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
      return { ok: false, error: 'Failed to create invitation' };
    }

    const createdInvitation = newInvitation[0];

    // 5. Get inviter name and organization name for the email
    const inviterUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
    });

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    });

    const inviterName = inviterUser?.name || 'Team Member';
    const organizationName = org?.name || 'Organization';

    // 6. Send invitation email
    const inviteLink = `${baseURL}/invitations/accept?token=${token}`;
    const mailSent = await sendInvitationEmail({
      toEmail: email,
      organizationName,
      inviterName,
      inviteLink,
    });

    // 7. Return invitation with mail status
    // Note: We return mailSent status even if it failed, and the invitation remains pending
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
      return {
        ok: false,
        error: 'Unauthenticated user cannot respond to invitation',
      };
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // 2. Find invitation by token
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.token, token),
    });

    if (!inv) {
      return {
        ok: false,
        error: 'Invitation not found',
      };
    }

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
      return {
        ok: false,
        error: '他のユーザへの招待ですので、招待されたメールアドレスで再ログインしてください。',
      };
    }

    // 6. Handle acceptance
    if (accept) {
      // Create membership and update invitation within a transaction
      await db.transaction(async (tx) => {
        const membershipId = randomUUID();
        const createdAt = new Date();

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

        // Update invitation status to accepted
        await tx
          .update(invitation)
          .set({
            status: 'accepted' as InvitationStatus,
            updatedAt: new Date(),
          })
          .where(eq(invitation.id, inv.id));
      });

      // 7. Get inviter info and send acceptance notification email
      const inviterUser = await db.query.user.findFirst({
        where: eq(user.id, inv.inviterId),
      });

      const org = await db.query.organization.findFirst({
        where: eq(organization.id, inv.organizationId),
      });

      if (inviterUser && org) {
        // Send notification email (do not fail if email fails)
        await sendAcceptanceNotificationEmail({
          toEmail: inviterUser.email,
          organizationName: org.name,
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
      // 8. Handle rejection - just update invitation status
      await db
        .update(invitation)
        .set({
          status: 'rejected' as InvitationStatus,
          updatedAt: new Date(),
        })
        .where(eq(invitation.id, inv.id));

      return {
        ok: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to respond to invitation';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}
