import { and, eq, gt } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/organization-authz', () => ({
  requireOrganizationAccessBySlug: vi.fn(),
}));

vi.mock('@/lib/organization-lifecycle', () => ({
  getOrganizationMembers: vi.fn(),
}));

import { requireOrganizationAccessBySlug } from '@/lib/organization-authz';
import { db } from '@/db';
import { invitation, membership, organization } from '@/db/schema';
import { getOrganizationMembers } from '@/lib/organization-lifecycle';
import {
  cancelInvitation,
  changeMemberRole,
  deleteOrganization,
  ensureOwnerRemainsAfterChange,
  leaveOrganization,
  listMembersForViewer,
  removeMember,
} from './organization-member-management';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ApplyChange = Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange'];

function asDbTransaction(tx: object): DbTransaction {
  return tx as unknown as DbTransaction;
}

function asDbSelectReturn<T>(chain: T): ReturnType<typeof db.select> {
  return chain as unknown as ReturnType<typeof db.select>;
}

function asDbDeleteReturn<T>(chain: T): ReturnType<typeof db.delete> {
  return chain as unknown as ReturnType<typeof db.delete>;
}

function createLockedMembershipSelectChain<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    for: vi.fn(() => promise),
  };

  return chain;
}

function createUnlockedMembershipSelectChain<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => promise),
  };

  return chain;
}

function createDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function createDeleteReturningChain<T>(rows: T[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({
    returning,
  }));

  return {
    where,
    returning,
  };
}

function createSelectWhereChain<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => promise),
  };

  return chain;
}

function createUpdateWhereReturningChain<T>(rows: T[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({
    returning,
  }));
  const set = vi.fn(() => ({
    where,
  }));

  return {
    set,
    where,
    returning,
  };
}

function createUpdateWhereChainWithoutReturning() {
  const where = vi.fn(() => ({}));
  const set = vi.fn(() => ({
    where,
  }));

  return {
    set,
    where,
  };
}

describe('organization-member-management', () => {
  const headers = new Headers({ authorization: 'Bearer test-token' });
  const slug = 'test-org';
  const organizationId = 'org-123';
  const joinedAt = new Date('2026-09-14T00:00:00.000Z');
  const members = [
    {
      id: 'membership-1',
      userId: 'user-1',
      userName: 'Owner User',
      userEmail: 'owner@example.com',
      displayName: 'オーナー',
      role: 'owner' as const,
      joinedAt,
    },
    {
      id: 'membership-2',
      userId: 'user-2',
      userName: 'Member User',
      userEmail: 'member@example.com',
      displayName: null,
      role: 'member' as const,
      joinedAt,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('owner 閲覧時は userEmail を含む members を返すこと', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'user-1',
      role: 'owner',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: true,
      members,
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(requireOrganizationAccessBySlug).toHaveBeenCalledWith({ headers, slug });
    expect(getOrganizationMembers).toHaveBeenCalledWith({ headers, organizationId });
    expect(result).toEqual({
      ok: true,
      organizationId,
      viewerRole: 'owner',
      members,
    });
  });

  it('member 閲覧時は userEmail を含まない members を返すこと', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'user-2',
      role: 'member',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: true,
      members,
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success result');
    }
    expect(result.organizationId).toBe(organizationId);
    expect(result.viewerRole).toBe('member');
    expect(result.members).toHaveLength(2);
    expect(result.members).toEqual([
      {
        id: 'membership-1',
        userId: 'user-1',
        userName: 'Owner User',
        displayName: 'オーナー',
        role: 'owner',
        joinedAt,
      },
      {
        id: 'membership-2',
        userId: 'user-2',
        userName: 'Member User',
        displayName: null,
        role: 'member',
        joinedAt,
      },
    ]);
    expect(result.members[0]?.userEmail).toBeUndefined();
    expect(result.members[1]?.userEmail).toBeUndefined();
  });

  it('初回認可時は owner でも再取得時に member へ降格していれば userEmail を含めず viewerRole も更新すること', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'user-1',
      role: 'owner',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: true,
      members: [
        {
          ...members[0],
          role: 'member',
        },
        members[1],
      ],
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result).toEqual({
      ok: true,
      organizationId,
      viewerRole: 'member',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'Owner User',
          displayName: 'オーナー',
          role: 'member',
          joinedAt,
        },
        {
          id: 'membership-2',
          userId: 'user-2',
          userName: 'Member User',
          displayName: null,
          role: 'member',
          joinedAt,
        },
      ],
    });
  });

  it('再取得時に閲覧者自身の membership が見つからなければ not-member を返すこと', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'user-1',
      role: 'owner',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: true,
      members: [members[1]],
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result).toEqual({
      ok: false,
      reason: 'not-member',
    });
  });

  it('非メンバー時は認可失敗理由をそのまま返し、メンバー取得を呼ばないこと', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: false,
      reason: 'not-member',
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result).toEqual({
      ok: false,
      reason: 'not-member',
    });
    expect(getOrganizationMembers).not.toHaveBeenCalled();
  });

  it('メンバー取得失敗時はエラーを記録して system-failure を返すこと', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'user-1',
      role: 'owner',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: false,
      error: 'some failure message',
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result).toEqual({
      ok: false,
      reason: 'system-failure',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[listMembersForViewer]'),
      'some failure message'
    );

    consoleErrorSpy.mockRestore();
  });

  describe('ensureOwnerRemainsAfterChange', () => {
    it('唯一の owner を除去するシミュレーションでは last-owner-protection を返し、更新しないこと', async () => {
      const applyChange = vi.fn<ApplyChange>();

      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          select: vi.fn(() =>
            createLockedMembershipSelectChain([
              {
                id: 'membership-1',
                userId: 'user-1',
                role: 'owner' as const,
              },
            ])
          ),
        };

        return callback(asDbTransaction(tx));
      });

      const result = await ensureOwnerRemainsAfterChange({
        organizationId,
        simulateChange: (currentMembers) => currentMembers.filter((member) => member.userId !== 'user-1'),
        applyChange,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'last-owner-protection',
      });
      expect(applyChange).not.toHaveBeenCalled();
    });

    it('複数 owner がいる場合は変更を許可して更新処理を1回だけ呼ぶこと', async () => {
      const applyChange = vi.fn<ApplyChange>().mockResolvedValue(undefined);

      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          select: vi.fn(() =>
            createLockedMembershipSelectChain([
              {
                id: 'membership-1',
                userId: 'user-1',
                role: 'owner' as const,
              },
              {
                id: 'membership-2',
                userId: 'user-2',
                role: 'owner' as const,
              },
            ])
          ),
        };

        return callback(asDbTransaction(tx));
      });

      const result = await ensureOwnerRemainsAfterChange({
        organizationId,
        simulateChange: (currentMembers) =>
          currentMembers.map((member) =>
            member.userId === 'user-1'
              ? {
                  ...member,
                  role: 'member',
                }
              : member
          ),
        applyChange,
      });

      expect(result).toEqual({
        ok: true,
      });
      expect(applyChange).toHaveBeenCalledTimes(1);
    });

    it('actingUserId がロック取得後に owner でなくなっていた場合は insufficient-role を返し、更新しないこと', async () => {
      const applyChange = vi.fn<ApplyChange>();

      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          select: vi.fn(() =>
            createLockedMembershipSelectChain([
              {
                id: 'membership-1',
                userId: 'user-1',
                role: 'member' as const,
              },
              {
                id: 'membership-2',
                userId: 'user-2',
                role: 'owner' as const,
              },
            ])
          ),
        };

        return callback(asDbTransaction(tx));
      });

      const result = await ensureOwnerRemainsAfterChange({
        organizationId,
        actingUserId: 'user-1',
        simulateChange: (currentMembers) => currentMembers,
        applyChange,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(applyChange).not.toHaveBeenCalled();
    });

    it('ロック取得が更新処理より先に完了すること', async () => {
      const callOrder: string[] = [];
      const lockedRows = [
        {
          id: 'membership-1',
          userId: 'user-1',
          role: 'owner' as const,
        },
        {
          id: 'membership-2',
          userId: 'user-2',
          role: 'owner' as const,
        },
      ];

      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const promise = Promise.resolve(lockedRows).then((rows) => {
          callOrder.push('lock-resolved');
          return rows;
        });
        const chain = {
          from: vi.fn(() => chain),
          innerJoin: vi.fn(() => chain),
          where: vi.fn(() => chain),
          for: vi.fn(() => {
            callOrder.push('for-update');
            return promise;
          }),
        };
        const tx = {
          select: vi.fn(() => {
            callOrder.push('select');
            return chain;
          }),
        };

        return callback(asDbTransaction(tx));
      });

      const applyChange = vi.fn<ApplyChange>(async () => {
        callOrder.push('apply-change');
      });

      const result = await ensureOwnerRemainsAfterChange({
        organizationId,
        simulateChange: (currentMembers) =>
          currentMembers.map((member) =>
            member.userId === 'user-1'
              ? {
                  ...member,
                  role: 'member',
                }
              : member
          ),
        applyChange,
      });

      expect(result).toEqual({
        ok: true,
      });
      expect(callOrder).toEqual(['select', 'for-update', 'lock-resolved', 'apply-change']);
    });

    it('ロッククエリが for("update") を持たない場合は system-failure を返すこと', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          select: vi.fn(() =>
            createUnlockedMembershipSelectChain([
              {
                id: 'membership-1',
                userId: 'user-1',
                role: 'owner' as const,
              },
            ])
          ),
        };

        return callback(asDbTransaction(tx));
      });

      const result = await ensureOwnerRemainsAfterChange({
        organizationId,
        simulateChange: (currentMembers) => currentMembers,
        applyChange: vi.fn<ApplyChange>(),
      });

      expect(result).toEqual({
        ok: false,
        reason: 'system-failure',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ensureOwnerRemainsAfterChange]'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('removeMember', () => {
    it('owner が member を削除すると所属を削除し、更新後の members を返すこと', async () => {
      const deleteChain = createDeleteReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await removeMember({ headers, slug, targetUserId: 'user-2' });

      expect(requireOrganizationAccessBySlug).toHaveBeenCalledWith({
        headers,
        slug,
        requiredRole: 'owner',
      });
      expect(tx.delete).toHaveBeenCalledWith(membership);
      expect(deleteChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-2'))
      );
      expect(deleteChain.returning).toHaveBeenCalledWith({ id: membership.id });
      expect(getOrganizationMembers).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        members: [members[0]],
      });
    });

    it('削除コミット後の再取得失敗で ok:false に降格させず、既知のメンバー一覧で成功を返すこと', async () => {
      const deleteChain = createDeleteReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );
      vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
        ok: false,
        error: 'post-commit fetch failed',
      });

      const result = await removeMember({ headers, slug, targetUserId: 'user-2' });

      expect(result).toEqual({
        ok: true,
        members: [members[0]],
      });
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('対象 membership の削除件数が 0 件なら not-found を返すこと', async () => {
      const deleteChain = createDeleteReturningChain([]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await removeMember({ headers, slug, targetUserId: 'missing-user' });

      expect(result).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(deleteChain.returning).toHaveBeenCalledWith({ id: membership.id });
    });

    it('member が removeMember を呼ぶと insufficient-role を返し、削除処理へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      });

      const result = await removeMember({ headers, slug, targetUserId: 'user-2' });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('acting owner が自分自身を targetUserId に指定すると insufficient-role を返し、削除処理へ進まないこと（自己脱退は leaveOrganization に集約）', async () => {
      const deleteChain = createDeleteChain();
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => deleteChain),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });

      const result = await removeMember({ headers, slug, targetUserId: 'user-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(tx.delete).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('ロック取得時点で acting owner が owner でなくなっていた場合は insufficient-role を返すこと', async () => {
      const deleteChain = createDeleteChain();
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'viewer-1',
              userName: 'Viewer User',
              userEmail: 'viewer@example.com',
              displayName: '閲覧者',
              role: 'member' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => deleteChain),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await removeMember({ headers, slug, targetUserId: 'user-2' });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(tx.delete).not.toHaveBeenCalled();
    });

    it('targetUserId と別メンバーの membership.id が衝突しても userId 条件だけで削除をシミュレートすること', async () => {
      const deleteChain = createDeleteReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'user-2',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await removeMember({ headers, slug, targetUserId: 'user-2' });

      expect(result).toEqual({
        ok: true,
        members: [
          {
            id: 'user-2',
            userId: 'user-1',
            userName: 'Owner User',
            userEmail: 'owner@example.com',
            displayName: 'オーナー',
            role: 'owner',
            joinedAt,
          },
        ],
      });
    });
  });

  describe('changeMemberRole', () => {
    it("owner が member を owner に変更すると、更新後の members を返すこと", async () => {
      const updateChain = createUpdateWhereReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'owner',
      });

      expect(tx.update).toHaveBeenCalledWith(membership);
      expect(updateChain.set).toHaveBeenCalledWith({ role: 'owner' });
      expect(updateChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-2'))
      );
      expect(updateChain.returning).toHaveBeenCalledWith({ id: membership.id });
      expect(result).toEqual({
        ok: true,
        members: [
          members[0],
          {
            ...members[1],
            role: 'owner',
          },
        ],
      });
    });

    it("owner が別の owner を member に変更できること（owner が2人以上いる場合）", async () => {
      const updateChain = createUpdateWhereReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'member',
      });

      expect(result).toEqual({
        ok: true,
        members: [
          members[0],
          {
            ...members[1],
            role: 'member',
          },
        ],
      });
    });

    it('owner が自分自身を member に変更できること（owner が2人以上いる場合）', async () => {
      const updateChain = createUpdateWhereReturningChain([{ id: 'membership-1' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Co Owner User',
              userEmail: 'co-owner@example.com',
              displayName: '共同オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-1',
        newRole: 'member',
      });

      expect(result).toEqual({
        ok: true,
        members: [
          {
            ...members[0],
            role: 'member',
          },
          {
            id: 'membership-2',
            userId: 'user-2',
            userName: 'Co Owner User',
            userEmail: 'co-owner@example.com',
            displayName: '共同オーナー',
            role: 'owner',
            joinedAt,
          },
        ],
      });
      expect(tx.update).toHaveBeenCalledWith(membership);
      expect(updateChain.set).toHaveBeenCalledWith({ role: 'member' });
      expect(updateChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-1'))
      );
      expect(updateChain.returning).toHaveBeenCalledWith({ id: membership.id });
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('唯一の owner を member に変更しようとすると last-owner-protection を返し、更新しないこと', async () => {
      const updateChain = createUpdateWhereReturningChain([{ id: 'membership-1' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-1',
        newRole: 'member',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'last-owner-protection',
      });
      expect(tx.update).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('member が changeMemberRole を呼ぶと insufficient-role を返し、更新処理へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      });

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'owner',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('不正な newRole 文字列は insufficient-role を返し、更新処理へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'admin' as never,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(requireOrganizationAccessBySlug).toHaveBeenCalledOnce();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('未認証の呼び出し元が不正な newRole を指定した場合は認可を優先して unauthenticated を返すこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'unauthenticated',
      });

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'admin' as never,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'unauthenticated',
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('ロック取得時点で acting owner が owner でなくなっていた場合は insufficient-role を返すこと', async () => {
      const updateChain = createUpdateWhereReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'viewer-1',
              userName: 'Viewer User',
              userEmail: 'viewer@example.com',
              displayName: '閲覧者',
              role: 'member' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'member',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('対象 membership の更新件数が 0 件なら not-found を返すこと', async () => {
      const updateChain = createUpdateWhereReturningChain([]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'viewer-1',
              userName: 'Viewer User',
              userEmail: 'viewer@example.com',
              displayName: '閲覧者',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'missing-user',
        newRole: 'owner',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'not-found',
      });
      expect(updateChain.returning).toHaveBeenCalledWith({ id: membership.id });
    });

    it('更新クエリが returning() を持たない場合は TypeError を送出すること', async () => {
      const updateChain = createUpdateWhereChainWithoutReturning();
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'viewer-1',
              userName: 'Viewer User',
              userEmail: 'viewer@example.com',
              displayName: '閲覧者',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'member',
      });

      expect(result).toEqual({
        ok: false,
        reason: 'system-failure',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('leaveOrganization', () => {
    it('owner が複数 owner の組織を自己脱退すると成功し、自身の所属を削除すること', async () => {
      const deleteChain = createDeleteReturningChain([{ id: 'membership-1' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Co Owner User',
              userEmail: 'co-owner@example.com',
              displayName: '共同オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await leaveOrganization({ headers, slug });

      expect(requireOrganizationAccessBySlug).toHaveBeenCalledWith({
        headers,
        slug,
        requiredRole: 'member',
      });
      expect(result).toEqual({ ok: true });
      expect(tx.delete).toHaveBeenCalledWith(membership);
      expect(deleteChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-1'))
      );
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('唯一の owner が自己脱退しようとすると last-owner-protection を返し、削除しないこと', async () => {
      const deleteChain = createDeleteChain();
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => deleteChain),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await leaveOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'last-owner-protection',
      });
      expect(tx.delete).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('member が自己脱退できること', async () => {
      const deleteChain = createDeleteReturningChain([{ id: 'membership-2' }]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-2',
        role: 'member',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await leaveOrganization({ headers, slug });

      expect(result).toEqual({ ok: true });
      expect(tx.delete).toHaveBeenCalledWith(membership);
      expect(deleteChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-2'))
      );
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('削除対象の membership が既に存在しない場合（並行削除等）は not-found を返すこと', async () => {
      const deleteChain = createDeleteReturningChain([]);
      const tx = {
        select: vi.fn(() =>
          createLockedMembershipSelectChain([
            {
              id: 'membership-1',
              userId: 'user-1',
              userName: 'Owner User',
              userEmail: 'owner@example.com',
              displayName: 'オーナー',
              role: 'owner' as const,
              joinedAt,
            },
            {
              id: 'membership-2',
              userId: 'user-2',
              userName: 'Member User',
              userEmail: 'member@example.com',
              displayName: null,
              role: 'member' as const,
              joinedAt,
            },
          ])
        ),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'user-2',
        role: 'member',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await leaveOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'not-found',
      });
    });

    it('非メンバーは認可失敗理由をそのまま返し、削除処理へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'not-member',
      });

      const result = await leaveOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'not-member',
      });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });
  });

  describe('cancelInvitation', () => {
    it('owner が pending 招待を取り消すと canceled に更新して成功を返すこと', async () => {
      const now = new Date('2026-09-14T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'owner' as const,
        },
      ]);
      const invitationSelectChain = createSelectWhereChain([
        {
          id: 'invitation-1',
          organizationId,
          status: 'pending' as const,
          expiresAt: new Date('2026-09-15T12:00:00.000Z'),
        },
      ]);
      const updateChain = createUpdateWhereReturningChain([{ id: 'invitation-1' }]);
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(asDbSelectReturn(membershipLockChain))
          .mockReturnValueOnce(asDbSelectReturn(invitationSelectChain)),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(requireOrganizationAccessBySlug).toHaveBeenCalledWith({
        headers,
        slug,
        requiredRole: 'owner',
      });
      expect(membershipLockChain.from).toHaveBeenCalledWith(membership);
      expect(membershipLockChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'viewer-1'))
      );
      expect(invitationSelectChain.from).toHaveBeenCalledWith(invitation);
      expect(invitationSelectChain.where).toHaveBeenCalledWith(
        and(eq(invitation.id, 'invitation-1'), eq(invitation.organizationId, organizationId))
      );
      expect(tx.update).toHaveBeenCalledWith(invitation);
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'canceled',
        updatedAt: now,
      });
      expect(updateChain.where).toHaveBeenCalledWith(
        and(
          eq(invitation.id, 'invitation-1'),
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, now)
        )
      );
      expect(updateChain.returning).toHaveBeenCalledWith({ id: invitation.id });
      expect(result).toEqual({ ok: true });
    });

    it('owner が pending 以外の招待を取り消そうとすると invitation-not-pending を返し、更新しないこと', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'owner' as const,
        },
      ]);
      const invitationSelectChain = createSelectWhereChain([
        {
          id: 'invitation-1',
          organizationId,
          status: 'accepted' as const,
          expiresAt: new Date('2026-09-15T12:00:00.000Z'),
        },
      ]);
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(asDbSelectReturn(membershipLockChain))
          .mockReturnValueOnce(asDbSelectReturn(invitationSelectChain)),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'invitation-not-pending',
      });
      expect(tx.select).toHaveBeenCalledTimes(2);
    });

    it('競合で pending 更新が 0 件になった場合は invitation-not-pending を返すこと', async () => {
      const now = new Date('2026-09-14T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'owner' as const,
        },
      ]);
      const invitationSelectChain = createSelectWhereChain([
        {
          id: 'invitation-1',
          organizationId,
          status: 'pending' as const,
          expiresAt: new Date('2026-09-15T12:00:00.000Z'),
        },
      ]);
      const updateChain = createUpdateWhereReturningChain([]);
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(asDbSelectReturn(membershipLockChain))
          .mockReturnValueOnce(asDbSelectReturn(invitationSelectChain)),
        update: vi.fn(() => ({
          set: updateChain.set,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'invitation-not-pending',
      });
      expect(updateChain.returning).toHaveBeenCalledWith({ id: invitation.id });
    });

    it('member が cancelInvitation を呼ぶと insufficient-role を返し、招待取得へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      });

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('対象招待が存在しない場合は invitation-not-pending を返すこと', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'owner' as const,
        },
      ]);
      const invitationSelectChain = createSelectWhereChain([]);
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(asDbSelectReturn(membershipLockChain))
          .mockReturnValueOnce(asDbSelectReturn(invitationSelectChain)),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'missing-invitation' });

      expect(result).toEqual({
        ok: false,
        reason: 'invitation-not-pending',
      });
      expect(tx.select).toHaveBeenCalledTimes(2);
    });

    it('期限切れの pending 招待は invitation-not-pending を返し、更新しないこと', async () => {
      const now = new Date('2026-09-14T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'owner' as const,
        },
      ]);
      const invitationSelectChain = createSelectWhereChain([
        {
          id: 'invitation-1',
          organizationId,
          status: 'pending' as const,
          expiresAt: new Date('2026-09-13T12:00:00.000Z'),
        },
      ]);
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(asDbSelectReturn(membershipLockChain))
          .mockReturnValueOnce(asDbSelectReturn(invitationSelectChain)),
        update: vi.fn(),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'invitation-not-pending',
      });
      expect(tx.update).not.toHaveBeenCalled();
    });

    it('ロック取得時点で acting owner が owner でなくなっていた場合は insufficient-role を返すこと', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          role: 'member' as const,
        },
      ]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        update: vi.fn(),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await cancelInvitation({ headers, slug, invitationId: 'invitation-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(tx.select).toHaveBeenCalledTimes(1);
      expect(tx.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteOrganization', () => {
    it('owner が組織を削除すると成功し、対象 organization 行の削除を実行すること', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          userId: 'viewer-1',
          role: 'owner' as const,
        },
      ]);
      const deleteChain = createDeleteReturningChain([{ id: organizationId }]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await deleteOrganization({ headers, slug });

      expect(requireOrganizationAccessBySlug).toHaveBeenCalledWith({
        headers,
        slug,
        requiredRole: 'owner',
      });
      expect(membershipLockChain.from).toHaveBeenCalledWith(membership);
      expect(membershipLockChain.where).toHaveBeenCalledWith(eq(membership.organizationId, organizationId));
      expect(tx.delete).toHaveBeenCalledWith(organization);
      expect(deleteChain.where).toHaveBeenCalledWith(eq(organization.id, organizationId));
      expect(deleteChain.returning).toHaveBeenCalledWith({ id: organization.id });
      expect(result).toEqual({ ok: true });
    });

    it('組織内の全 membership 行をロックし、他メンバーの行に紛れていても acting owner を特定できること（cascade削除とのデッドロック回避）', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        { userId: 'member-1', role: 'member' as const },
        { userId: 'viewer-1', role: 'owner' as const },
        { userId: 'member-2', role: 'member' as const },
      ]);
      const deleteChain = createDeleteReturningChain([{ id: organizationId }]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await deleteOrganization({ headers, slug });

      // organizationId のみで絞り込み、組織内の全 membership 行をロックすることを確認する
      // （ensureOwnerRemainsAfterChange と同じロック範囲にすることで、cascade削除との
      // ロック順序不一致によるデッドロックを回避する）
      expect(membershipLockChain.where).toHaveBeenCalledWith(eq(membership.organizationId, organizationId));
      expect(result).toEqual({ ok: true });
    });

    it('member が deleteOrganization を呼ぶと insufficient-role を返し、削除処理へ進まないこと', async () => {
      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      });

      const result = await deleteOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('組織削除で例外が発生した場合は捕捉してログを記録し、system-failure の失敗結果を返すこと（組織状態は維持される）', async () => {
      const deleteError = new Error('delete failed');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          userId: 'viewer-1',
          role: 'owner' as const,
        },
      ]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        delete: vi.fn(() =>
          asDbDeleteReturn({
            where: vi.fn(() => ({
              returning: vi.fn().mockRejectedValueOnce(deleteError),
            })),
          })
        ),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await deleteOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'system-failure',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[deleteOrganization] Failed to delete organization:',
        deleteError
      );

      consoleErrorSpy.mockRestore();
    });

    it('ロック取得時点で acting owner が owner でなくなっていた場合は insufficient-role を返すこと', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          userId: 'viewer-1',
          role: 'member' as const,
        },
      ]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        delete: vi.fn(),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await deleteOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'insufficient-role',
      });
      expect(tx.delete).not.toHaveBeenCalled();
    });

    it('削除件数が 0 件なら organization-not-found を返すこと', async () => {
      const membershipLockChain = createLockedMembershipSelectChain([
        {
          userId: 'viewer-1',
          role: 'owner' as const,
        },
      ]);
      const deleteChain = createDeleteReturningChain([]);
      const tx = {
        select: vi.fn().mockReturnValueOnce(asDbSelectReturn(membershipLockChain)),
        delete: vi.fn(() => ({
          where: deleteChain.where,
        })),
      };

      vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
        ok: true,
        organizationId,
        organizationName: 'Test Org',
        organizationSlug: slug,
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(asDbTransaction(tx))
      );

      const result = await deleteOrganization({ headers, slug });

      expect(result).toEqual({
        ok: false,
        reason: 'organization-not-found',
      });
      expect(deleteChain.returning).toHaveBeenCalledWith({ id: organization.id });
    });
  });
});
