import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq, and } from 'drizzle-orm';
import { organization, membership, type OrganizationRole } from '@/db/schema';

export type { OrganizationRole };

type OrganizationAccessFailureReason =
  | 'unauthenticated'
  | 'organization-not-found'
  | 'not-member'
  | 'insufficient-role';

export type OrganizationAccess =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly userId: string;
      readonly role: OrganizationRole;
    }
  | {
      readonly ok: false;
      readonly reason: OrganizationAccessFailureReason;
    };

export interface RequireOrganizationAccessInput {
  readonly headers: Headers;
  readonly organizationId: string;
  readonly requiredRole?: OrganizationRole;
}

export interface RequireOrganizationAccessBySlugInput {
  readonly headers: Headers;
  readonly slug: string;
  readonly requiredRole?: OrganizationRole;
}

export type OrganizationAccessBySlug =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly organizationName: string;
      readonly organizationSlug: string;
      readonly userId: string;
      readonly role: OrganizationRole;
    }
  | {
      readonly ok: false;
      readonly reason: OrganizationAccessFailureReason;
    };

type MembershipCheckResult =
  | {
      readonly ok: true;
      readonly userId: string;
      readonly role: OrganizationRole;
    }
  | {
      readonly ok: false;
      readonly reason: Extract<OrganizationAccessFailureReason, 'not-member' | 'insufficient-role'>;
    };

async function checkMembershipAndRole(input: {
  readonly organizationId: string;
  readonly userId: string;
  readonly requiredRole?: OrganizationRole;
}): Promise<MembershipCheckResult> {
  const { organizationId, userId, requiredRole } = input;
  const memberRecords = await db
    .select({ id: membership.id, role: membership.role })
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)))
    .limit(1);

  if (memberRecords.length === 0) {
    return { ok: false, reason: 'not-member' };
  }

  const memberRecord = memberRecords[0];

  if (requiredRole === 'owner' && memberRecord.role !== 'owner') {
    return { ok: false, reason: 'insufficient-role' };
  }

  return {
    ok: true,
    userId,
    role: memberRecord.role as OrganizationRole,
  };
}

export async function requireOrganizationAccess(input: RequireOrganizationAccessInput): Promise<OrganizationAccess> {
  const { headers, organizationId, requiredRole } = input;
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user) {
    return { ok: false, reason: 'unauthenticated' };
  }

  const userId = session.user.id;
  const orgRecords = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (orgRecords.length === 0) {
    return { ok: false, reason: 'organization-not-found' };
  }

  const membershipAccess = await checkMembershipAndRole({
    organizationId,
    userId,
    requiredRole,
  });

  if (!membershipAccess.ok) {
    return membershipAccess;
  }

  return {
    ok: true,
    organizationId,
    userId: membershipAccess.userId,
    role: membershipAccess.role,
  };
}

export async function requireOrganizationAccessBySlug(
  input: RequireOrganizationAccessBySlugInput
): Promise<OrganizationAccessBySlug> {
  const { headers, slug, requiredRole } = input;
  const session = await auth.api.getSession({ headers });

  if (!session || !session.user) {
    console.error('[requireOrganizationAccessBySlug] Access denied: unauthenticated');
    return { ok: false, reason: 'unauthenticated' };
  }

  const userId = session.user.id;
  const normalizedSlug = slug.trim().toLowerCase();
  const orgRecords = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(eq(organization.slug, normalizedSlug))
    .limit(1);

  if (orgRecords.length === 0) {
    console.error(`[requireOrganizationAccessBySlug] Organization not found for slug: ${normalizedSlug}`);
    return { ok: false, reason: 'organization-not-found' };
  }

  const orgRecord = orgRecords[0];
  const membershipAccess = await checkMembershipAndRole({
    organizationId: orgRecord.id,
    userId,
    requiredRole,
  });

  if (!membershipAccess.ok) {
    if (membershipAccess.reason === 'not-member') {
      console.error(`[requireOrganizationAccessBySlug] User is not a member of organization: ${orgRecord.id}`);
    } else {
      console.error(
        `[requireOrganizationAccessBySlug] User role is insufficient for organization: ${orgRecord.id}`
      );
    }

    return membershipAccess;
  }

  return {
    ok: true,
    organizationId: orgRecord.id,
    organizationName: orgRecord.name,
    organizationSlug: orgRecord.slug,
    userId: membershipAccess.userId,
    role: membershipAccess.role,
  };
}
