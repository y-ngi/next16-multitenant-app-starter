import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { organization, membership, user, type OrganizationRole } from '@/db/schema';
import { randomUUID } from 'crypto';

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
