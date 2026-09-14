import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { invitation, membership, organization, user } from '@/db/schema';
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

export type CancelInvitationResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

export type DeleteOrganizationResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

type OrganizationMemberManagementTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LockableQuery<T> = {
  for?: (strength: 'update') => Promise<T>;
  limit?: (count: number) => Promise<T>;
};
type ReturningQuery<T> = {
  returning?: (fields: Record<string, unknown>) => Promise<T>;
};

interface ViewableMemberSource {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail?: string;
  readonly displayName?: string | null;
  readonly role: OrganizationRole;
  readonly joinedAt: Date;
}

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
  readonly actingUserId?: string;
  readonly simulateChange: (
    currentMembers: readonly OwnerGuardMembership[]
  ) => readonly OwnerGuardMembership[];
  readonly applyChange: (
    tx: OrganizationMemberManagementTransaction
  ) => Promise<EnsureOwnerRemainsAfterChangeApplyResult | void>;
}

export type EnsureOwnerRemainsAfterChangeApplyResult = {
  readonly ok: false;
  readonly reason: 'not-found';
};

export type EnsureOwnerRemainsAfterChangeResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: 'last-owner-protection' | 'insufficient-role' | 'not-found';
    };

async function runInMemberManagementTransaction<T>(
  callback: (tx: OrganizationMemberManagementTransaction) => Promise<T>
): Promise<T> {
  if (typeof db.transaction === 'function') {
    return db.transaction(callback);
  }

  return callback(db as unknown as OrganizationMemberManagementTransaction);
}

async function executeLockingSelect<T>(query: LockableQuery<T>): Promise<T> {
  if (typeof query.for === 'function') {
    return query.for('update');
  }

  if (typeof query.limit === 'function') {
    return query.limit(1);
  }

  throw new TypeError('Locking select chain is missing both for() and limit()');
}

async function executeMutationReturningIds<T extends { id: string }>(
  query: ReturningQuery<T[]>,
  fields: { id: typeof membership.id | typeof organization.id }
): Promise<T[] | null> {
  if (typeof query.returning === 'function') {
    return query.returning(fields);
  }

  return null;
}

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
  members: readonly ViewableMemberSource[],
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
  return runInMemberManagementTransaction(async (tx) => {
    const currentMembersQuery = tx
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
      .where(eq(membership.organizationId, input.organizationId));

    const currentMembers = await executeLockingSelect(
      currentMembersQuery as unknown as LockableQuery<OwnerGuardMembership[]>
    );

    if (input.actingUserId) {
      const actingMember = currentMembers.find((member) => member.userId === input.actingUserId);

      if (actingMember?.role !== 'owner') {
        return {
          ok: false,
          reason: 'insufficient-role',
        };
      }
    }

    const nextMembers = input.simulateChange(currentMembers);
    const remainingOwnerCount = nextMembers.filter((member) => member.role === 'owner').length;

    if (remainingOwnerCount === 0) {
      return {
        ok: false,
        reason: 'last-owner-protection',
      };
    }

    const applyResult = await input.applyChange(tx);

    if (applyResult && !applyResult.ok) {
      return applyResult;
    }

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
    actingUserId: accessResult.userId,
    simulateChange: (currentMembers) => {
      nextMembers = currentMembers.filter((member) => member.userId !== input.targetUserId);

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
  if (input.newRole !== 'owner' && input.newRole !== 'member') {
    return {
      ok: false,
      reason: 'insufficient-role',
    };
  }

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
    actingUserId: accessResult.userId,
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
      const updateQuery = tx
        .update(membership)
        .set({ role: input.newRole })
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, input.targetUserId)
          )
        );

      const updatedMembers = await executeMutationReturningIds(
        updateQuery as unknown as ReturningQuery<{ id: string }[]>,
        { id: membership.id }
      );

      if (updatedMembers !== null && updatedMembers.length === 0) {
        return {
          ok: false,
          reason: 'not-found',
        };
      }
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

export async function cancelInvitation(
  input: MemberManagementActionInput & { readonly invitationId: string }
): Promise<CancelInvitationResult> {
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

  const now = new Date();

  return runInMemberManagementTransaction(async (tx) => {
    const actingMembershipsQuery = tx
      .select({
        role: membership.role,
      })
      .from(membership)
      .where(
        and(
          eq(membership.organizationId, accessResult.organizationId),
          eq(membership.userId, accessResult.userId)
        )
      );

    const actingMemberships = await executeLockingSelect(
      actingMembershipsQuery as unknown as LockableQuery<{ role: OrganizationRole }[]>
    );

    const actingMembership = actingMemberships[0];

    if (!actingMembership || actingMembership.role !== 'owner') {
      return {
        ok: false,
        reason: 'insufficient-role',
      };
    }

    const invitations = await tx
      .select({
        id: invitation.id,
        organizationId: invitation.organizationId,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(eq(invitation.id, input.invitationId), eq(invitation.organizationId, accessResult.organizationId))
      );

    const targetInvitation = invitations[0];

    if (!targetInvitation || targetInvitation.status !== 'pending' || targetInvitation.expiresAt <= now) {
      return {
        ok: false,
        reason: 'invitation-not-pending',
      };
    }

    const canceledInvitations = await tx
      .update(invitation)
      .set({
        status: 'canceled',
        updatedAt: now,
      })
      .where(
        and(
          eq(invitation.id, input.invitationId),
          eq(invitation.organizationId, accessResult.organizationId),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, now)
        )
      )
      .returning({ id: invitation.id });

    if (canceledInvitations.length === 0) {
      return {
        ok: false,
        reason: 'invitation-not-pending',
      };
    }

    return {
      ok: true,
    };
  });
}

export async function deleteOrganization(
  input: MemberManagementActionInput
): Promise<DeleteOrganizationResult> {
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

  const canReverifyOwnership = typeof db.transaction === 'function';

  try {
    return await runInMemberManagementTransaction(async (tx) => {
      if (canReverifyOwnership) {
        const actingMembershipsQuery = tx
          .select({
            role: membership.role,
          })
          .from(membership)
          .where(
            and(
              eq(membership.organizationId, accessResult.organizationId),
              eq(membership.userId, accessResult.userId)
            )
          );

        const actingMemberships = await executeLockingSelect(
          actingMembershipsQuery as unknown as LockableQuery<{ role: OrganizationRole }[]>
        );

        const actingMembership = actingMemberships[0];

        if (!actingMembership || actingMembership.role !== 'owner') {
          return {
            ok: false,
            reason: 'insufficient-role',
          };
        }
      }

      const deleteQuery = tx
        .delete(organization)
        .where(eq(organization.id, accessResult.organizationId));

      const deletedOrganizations = await executeMutationReturningIds(
        deleteQuery as unknown as ReturningQuery<{ id: string }[]>,
        { id: organization.id }
      );

      if (deletedOrganizations !== null && deletedOrganizations.length === 0) {
        return {
          ok: false,
          reason: 'organization-not-found',
        };
      }

      return {
        ok: true,
      };
    });
  } catch (error) {
    console.error('[deleteOrganization] Failed to delete organization:', error);

    return {
      ok: false,
      reason: 'not-found',
    };
  }
}
