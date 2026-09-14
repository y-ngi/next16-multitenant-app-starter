import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { membership } from '@/db/schema';
import { requireOrganizationAccessBySlug, type OrganizationRole } from '@/lib/organization-authz';
import { getOrganizationMembers } from '@/lib/organization-lifecycle';

export type { OrganizationRole };

export interface MemberManagementActionInput {
  readonly headers: Headers;
  readonly slug: string;
}

export type MemberManagementFailureReason =
  | 'unauthenticated'
  | 'organization-not-found'
  | 'not-member'
  | 'insufficient-role'
  | 'last-owner-protection'
  | 'invitation-not-pending'
  | 'not-found';

export interface ViewableMember {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail?: string;
  readonly displayName?: string | null;
  readonly role: OrganizationRole;
  readonly joinedAt: Date;
}

export type ListMembersResult =
  | {
      readonly ok: true;
      readonly organizationId: string;
      readonly viewerRole: OrganizationRole;
      readonly members: readonly ViewableMember[];
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

type OrganizationMemberManagementTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OwnerGuardMembership {
  readonly id: string;
  readonly userId: string;
  readonly role: OrganizationRole;
}

export interface EnsureOwnerRemainsAfterChangeInput {
  readonly organizationId: string;
  readonly simulateChange: (
    currentMembers: readonly OwnerGuardMembership[]
  ) => readonly OwnerGuardMembership[];
  readonly applyChange: (tx: OrganizationMemberManagementTransaction) => Promise<void>;
}

export type EnsureOwnerRemainsAfterChangeResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: 'last-owner-protection';
    };

export async function ensureOwnerRemainsAfterChange(
  input: EnsureOwnerRemainsAfterChangeInput
): Promise<EnsureOwnerRemainsAfterChangeResult> {
  return db.transaction(async (tx) => {
    const currentMembers = await tx
      .select({
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
      })
      .from(membership)
      .where(eq(membership.organizationId, input.organizationId))
      .for('update');

    const nextMembers = input.simulateChange(currentMembers);
    const remainingOwnerCount = nextMembers.filter((member) => member.role === 'owner').length;

    if (remainingOwnerCount === 0) {
      return {
        ok: false,
        reason: 'last-owner-protection',
      };
    }

    await input.applyChange(tx);

    return {
      ok: true,
    };
  });
}

export async function listMembersForViewer(input: MemberManagementActionInput): Promise<ListMembersResult> {
  const accessResult = await requireOrganizationAccessBySlug({
    headers: input.headers,
    slug: input.slug,
  });

  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason,
    };
  }

  const membersResult = await getOrganizationMembers({
    headers: input.headers,
    organizationId: accessResult.organizationId,
  });

  if (!membersResult.ok) {
    console.error('[listMembersForViewer] Failed to fetch organization members:', membersResult.error);
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  if (!membersResult.members) {
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  const members: readonly ViewableMember[] =
    accessResult.role === 'owner'
      ? membersResult.members
      : membersResult.members.map((member) => ({
          id: member.id,
          userId: member.userId,
          userName: member.userName,
          displayName: member.displayName,
          role: member.role,
          joinedAt: member.joinedAt,
        }));

  return {
    ok: true,
    organizationId: accessResult.organizationId,
    viewerRole: accessResult.role,
    members,
  };
}
