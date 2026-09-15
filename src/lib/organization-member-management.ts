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
  | 'not-found'
  | 'system-failure';

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
  for?: (strength: 'update', config?: { readonly of?: unknown }) => Promise<T>;
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
      readonly reason: 'last-owner-protection' | 'insufficient-role' | 'not-found' | 'system-failure';
    };

async function runInMemberManagementTransaction<T>(
  callback: (tx: OrganizationMemberManagementTransaction) => Promise<T>
): Promise<T> {
  if (typeof db.transaction === 'function') {
    return db.transaction(callback);
  }

  return callback(db as unknown as OrganizationMemberManagementTransaction);
}

async function executeLockingSelect<T>(
  query: LockableQuery<T>,
  lockConfig?: { readonly of?: unknown }
): Promise<T> {
  if (typeof query.for !== 'function') {
    throw new TypeError('Locking select chain is missing for()');
  }

  return query.for('update', lockConfig);
}

async function executeMutationReturningIds<T extends { id: string }>(
  query: ReturningQuery<T[]>,
  fields: { id: typeof membership.id | typeof organization.id }
): Promise<T[]> {
  if (typeof query.returning !== 'function') {
    throw new TypeError('Mutation returning chain is missing returning()');
  }

  return query.returning(fields);
}

type ViewableMembersFetchResult =
  | {
      readonly ok: true;
      readonly members: readonly ViewableMemberSource[];
    }
  | {
      readonly ok: false;
      readonly reason: MemberManagementFailureReason;
    };

function mapMembersFetchErrorToReason(errorMessage: string | undefined): MemberManagementFailureReason {
  switch (errorMessage) {
    case 'Unauthenticated':
      return 'unauthenticated';
    case 'Not a member of this organization':
      return 'not-member';
    case 'Organization not found':
      return 'organization-not-found';
    case 'Insufficient role to access this organization':
      return 'insufficient-role';
    default:
      return 'system-failure';
  }
}

async function getOrganizationMembersForView(input: {
  readonly headers: Headers;
  readonly organizationId: string;
  readonly errorLogPrefix: string;
}): Promise<ViewableMembersFetchResult> {
  const membersResult = await getOrganizationMembers({
    headers: input.headers,
    organizationId: input.organizationId,
  });

  if (!membersResult.ok) {
    console.error(`${input.errorLogPrefix} Failed to fetch organization members:`, membersResult.error);
    return {
      ok: false,
      reason: mapMembersFetchErrorToReason(membersResult.error),
    };
  }

  if (!membersResult.members) {
    return {
      ok: false,
      reason: 'system-failure',
    };
  }

  return {
    ok: true,
    members: membersResult.members,
  };
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
  try {
    return await runInMemberManagementTransaction(async (tx) => {
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

      // ロック対象を membership 行のみに限定する（`of: membership` を指定しない場合、
      // PostgreSQL は inner join した user 行も FOR UPDATE でロックしてしまい、
      // 無関係な組織のユーザー更新まで巻き込んでデッドロック要因になり得るため）
      const currentMembers = await executeLockingSelect(
        currentMembersQuery as unknown as LockableQuery<OwnerGuardMembership[]>,
        { of: membership }
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
  } catch (error) {
    console.error('[ensureOwnerRemainsAfterChange] Unexpected error while applying member change:', error);
    return {
      ok: false,
      reason: 'system-failure',
    };
  }
}

export async function listMembersForViewer(input: MemberManagementActionInput): Promise<ListMembersResult> {
  try {
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

    const membersFetchResult = await getOrganizationMembersForView({
      headers: input.headers,
      organizationId: accessResult.organizationId,
      errorLogPrefix: '[listMembersForViewer]',
    });

    if (!membersFetchResult.ok) {
      return {
        ok: false,
        reason: membersFetchResult.reason,
      };
    }

    const members = membersFetchResult.members;
    const currentViewerMembership = members.find((member) => member.userId === accessResult.userId);

    if (!currentViewerMembership) {
      return {
        ok: false,
        reason: 'not-member',
      };
    }

    return {
      ok: true,
      organizationId: accessResult.organizationId,
      viewerRole: currentViewerMembership.role,
      members: toViewableMembersForRole(members, currentViewerMembership.role),
    };
  } catch (error) {
    console.error('[listMembersForViewer] Unexpected error while listing members:', error);
    return {
      ok: false,
      reason: 'system-failure',
    };
  }
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

  // removeMember は owner が他者を削除する操作専用であり、自己脱退は
  // leaveOrganization に一本化されている（design: 自己対象操作の契約統一）
  if (input.targetUserId === accessResult.userId) {
    return {
      ok: false,
      reason: 'insufficient-role',
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
      const deleteQuery = tx
        .delete(membership)
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, input.targetUserId)
          )
        );

      const deletedMembers = await executeMutationReturningIds(
        deleteQuery as unknown as ReturningQuery<{ id: string }[]>,
        { id: membership.id }
      );

      if (deletedMembers.length === 0) {
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

  // 認可（requireOrganizationAccessBySlug）を必ず先に実行する契約のため、
  // 入力値検証は認可成功後に行う（未認証ユーザーに insufficient-role を
  // 返してしまう順序誤りを避けるため）
  if (input.newRole !== 'owner' && input.newRole !== 'member') {
    return {
      ok: false,
      reason: 'insufficient-role',
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

      if (updatedMembers.length === 0) {
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

  // 自己対象の変更（actor が自分自身のロールを変更した）の場合、投影ロールは
  // 変更後のロール（input.newRole）を使う。変更前の accessResult.role（owner）を
  // 使うと、自己降格直後のレスポンスに owner 専用情報（全メンバーのメール等）が
  // 混入してしまう
  const projectionRole =
    input.targetUserId === accessResult.userId ? input.newRole : accessResult.role;

  return {
    ok: true,
    members: toViewableMembersForRole(nextMembers, projectionRole),
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
      const deleteQuery = tx
        .delete(membership)
        .where(
          and(
            eq(membership.organizationId, accessResult.organizationId),
            eq(membership.userId, accessResult.userId)
          )
        );

      const deletedMembers = await executeMutationReturningIds(
        deleteQuery as unknown as ReturningQuery<{ id: string }[]>,
        { id: membership.id }
      );

      if (deletedMembers.length === 0) {
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

  try {
    return await runInMemberManagementTransaction(async (tx) => {
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

      // 招待行自体をロックしてから、その直後の時刻で期限を判定する。ロック取得前の
      // `now` を UPDATE の WHERE 条件にまで使い回すと、招待行のロック待ちで
      // ブロックされている間に実際には期限切れになったケースを、古い `now` で
      // 判定してキャンセルを成功させてしまう恐れがあるため
      const invitationsQuery = tx
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

      const invitations = await executeLockingSelect(
        invitationsQuery as unknown as LockableQuery<
          { id: string; organizationId: string; status: string; expiresAt: Date }[]
        >
      );

      const now = new Date();

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
  } catch (error) {
    console.error('[cancelInvitation] Unexpected error while canceling invitation:', error);
    return {
      ok: false,
      reason: 'system-failure',
    };
  }
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
        const organizationMembershipsQuery = tx
          .select({
            userId: membership.userId,
            role: membership.role,
          })
          .from(membership)
          .where(eq(membership.organizationId, accessResult.organizationId));

        const organizationMemberships = await executeLockingSelect(
          organizationMembershipsQuery as unknown as LockableQuery<
            { userId: string; role: OrganizationRole }[]
          >
        );

        // 組織が並行して既に削除されている場合、cascade により membership 行も
        // すべて消えているため、空配列は「acting owner が owner でなくなった」の
        // ではなく「組織自体が既に存在しない」ことを意味する
        if (organizationMemberships.length === 0) {
          return {
            ok: false,
            reason: 'organization-not-found',
          };
        }

        const actingMembership = organizationMemberships.find(
          (member) => member.userId === accessResult.userId
        );

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

      if (deletedOrganizations.length === 0) {
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
      reason: 'system-failure',
    };
  }
}
