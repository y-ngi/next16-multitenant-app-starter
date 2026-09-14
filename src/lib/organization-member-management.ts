import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { membership, user } from '@/db/schema';
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

export type MemberMutationResult =
  | {
      readonly ok: true;
      readonly members: readonly ViewableMember[];
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

export type LeaveOrganizationResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

type OrganizationMemberManagementTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OwnerGuardMembership {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly displayName: string | null;
  readonly role: OrganizationRole;
  readonly joinedAt: Date;
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

async function getViewableMembers(input: {
  readonly headers: Headers;
  readonly organizationId: string;
  readonly viewerRole: OrganizationRole;
  readonly errorLogPrefix: string;
}): Promise<readonly ViewableMember[] | null> {
  const membersResult = await getOrganizationMembers({
    headers: input.headers,
    organizationId: input.organizationId,
  });

  if (!membersResult.ok) {
    console.error(`${input.errorLogPrefix} Failed to fetch organization members:`, membersResult.error);
    return null;
  }

  if (!membersResult.members) {
    return null;
  }

  return toViewableMembersForRole(membersResult.members, input.viewerRole);
}

function toViewableMembersForRole(
  members: readonly OwnerGuardMembership[],
  viewerRole: OrganizationRole
): readonly ViewableMember[] {
  return viewerRole === 'owner'
    ? members.map((member) => ({
        id: member.id,
        userId: member.userId,
        userName: member.userName,
        userEmail: member.userEmail,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      }))
    : members.map((member) => ({
        id: member.id,
        userId: member.userId,
        userName: member.userName,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      }));
}

export async function ensureOwnerRemainsAfterChange(
  input: EnsureOwnerRemainsAfterChangeInput
): Promise<EnsureOwnerRemainsAfterChangeResult> {
  return db.transaction(async (tx) => {
    const currentMembers = await tx
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

  const members = await getViewableMembers({
    headers: input.headers,
    organizationId: accessResult.organizationId,
    viewerRole: accessResult.role,
    errorLogPrefix: '[listMembersForViewer]',
  });

  if (!members) {
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  return {
    ok: true,
    organizationId: accessResult.organizationId,
    viewerRole: accessResult.role,
    members,
  };
}

export async function removeMember(
  input: MemberManagementActionInput & { readonly targetUserId: string }
): Promise<MemberMutationResult> {
  const accessResult = await requireOrganizationAccessBySlug({
    headers: input.headers,
    slug: input.slug,
    requiredRole: 'owner',
  });

  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason,
    };
  }

  let nextMembers: readonly OwnerGuardMembership[] = [];
  const guardResult = await ensureOwnerRemainsAfterChange({
    organizationId: accessResult.organizationId,
    simulateChange: (currentMembers) => {
      nextMembers = currentMembers.filter(
        (member) => member.id !== input.targetUserId && member.userId !== input.targetUserId
      );

      return nextMembers;
    },
    applyChange: async (tx) => {
      await tx
        .delete(membership)
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, input.targetUserId)
          )
        );
    },
  });

  if (!guardResult.ok) {
    return guardResult;
  }

  return {
    ok: true,
    members: toViewableMembersForRole(nextMembers, accessResult.role),
  };
}

export async function changeMemberRole(
  input: MemberManagementActionInput & {
    readonly targetUserId: string;
    readonly newRole: OrganizationRole;
  }
): Promise<MemberMutationResult> {
  const accessResult = await requireOrganizationAccessBySlug({
    headers: input.headers,
    slug: input.slug,
    requiredRole: 'owner',
  });

  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason,
    };
  }

  let nextMembers: readonly OwnerGuardMembership[] = [];
  const guardResult = await ensureOwnerRemainsAfterChange({
    organizationId: accessResult.organizationId,
    simulateChange: (currentMembers) => {
      nextMembers = currentMembers.map((member) =>
        member.userId === input.targetUserId
          ? {
              ...member,
              role: input.newRole,
            }
          : member
      );

      return nextMembers;
    },
    applyChange: async (tx) => {
      await tx
        .update(membership)
        .set({ role: input.newRole })
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, input.targetUserId)
          )
        );
    },
  });

  if (!guardResult.ok) {
    return guardResult;
  }

  return {
    ok: true,
    members: toViewableMembersForRole(nextMembers, accessResult.role),
  };
}

export async function leaveOrganization(
  input: MemberManagementActionInput
): Promise<LeaveOrganizationResult> {
  const accessResult = await requireOrganizationAccessBySlug({
    headers: input.headers,
    slug: input.slug,
    requiredRole: 'member',
  });

  if (!accessResult.ok) {
    return {
      ok: false,
      reason: accessResult.reason,
    };
  }

  const guardResult = await ensureOwnerRemainsAfterChange({
    organizationId: accessResult.organizationId,
    simulateChange: (currentMembers) =>
      currentMembers.filter((member) => member.userId !== accessResult.userId),
    applyChange: async (tx) => {
      await tx
        .delete(membership)
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, accessResult.userId)
          )
        );
    },
  });

  if (!guardResult.ok) {
    return guardResult;
  }

  return {
    ok: true,
  };
}
