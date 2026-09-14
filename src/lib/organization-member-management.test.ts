import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(),
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
import { membership } from '@/db/schema';
import { getOrganizationMembers } from '@/lib/organization-lifecycle';
import {
  changeMemberRole,
  ensureOwnerRemainsAfterChange,
  leaveOrganization,
  listMembersForViewer,
  removeMember,
} from './organization-member-management';

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

function createDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
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

  it('owner 閲覧時は userEmail を含む members を返すこと', async () => {
    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'viewer-1',
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
      userId: 'viewer-2',
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

  it('メンバー取得失敗時はエラーを記録して not-found を返すこと', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(requireOrganizationAccessBySlug).mockResolvedValueOnce({
      ok: true,
      organizationId,
      organizationName: 'Test Org',
      organizationSlug: slug,
      userId: 'viewer-1',
      role: 'owner',
    });
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce({
      ok: false,
      error: 'some failure message',
    });

    const result = await listMembersForViewer({ headers, slug });

    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[listMembersForViewer]'),
      'some failure message'
    );

    consoleErrorSpy.mockRestore();
  });

  describe('ensureOwnerRemainsAfterChange', () => {
    it('唯一の owner を除去するシミュレーションでは last-owner-protection を返し、更新しないこと', async () => {
      const applyChange = vi.fn<
        Parameters<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>,
        ReturnType<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>
      >();

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

        return callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0]);
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
      const applyChange = vi.fn<
        Parameters<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>,
        ReturnType<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>
      >().mockResolvedValue(undefined);

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

        return callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0]);
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

        return callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0]);
      });

      const applyChange = vi.fn<
        Parameters<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>,
        ReturnType<Parameters<typeof ensureOwnerRemainsAfterChange>[0]['applyChange']>
      >(async () => {
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
  });

  describe('removeMember', () => {
    it('owner が member を削除すると所属を削除し、更新後の members を返すこと', async () => {
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
        delete: vi.fn(() => deleteChain),
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
      expect(getOrganizationMembers).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        members: [members[0]],
      });
    });

    it('削除コミット後の再取得失敗で ok:false に降格させず、既知のメンバー一覧で成功を返すこと', async () => {
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
        delete: vi.fn(() => deleteChain),
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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

    it('唯一の owner を削除しようとすると last-owner-protection を返すこと', async () => {
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
        userId: 'viewer-1',
        role: 'owner',
      });
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) =>
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
      );

      const result = await removeMember({ headers, slug, targetUserId: 'user-1' });

      expect(result).toEqual({
        ok: false,
        reason: 'last-owner-protection',
      });
      expect(tx.delete).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });
  });

  describe('changeMemberRole', () => {
    it("owner が member を owner に変更すると、更新後の members を返すこと", async () => {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({
        where: updateWhere,
      }));
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
          set: updateSet,
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
      );

      const result = await changeMemberRole({
        headers,
        slug,
        targetUserId: 'user-2',
        newRole: 'owner',
      });

      expect(tx.update).toHaveBeenCalledWith(membership);
      expect(updateSet).toHaveBeenCalledWith({ role: 'owner' });
      expect(updateWhere).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-2'))
      );
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
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({
        where: updateWhere,
      }));
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
          set: updateSet,
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({
        where: updateWhere,
      }));
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
          set: updateSet,
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
      expect(updateSet).toHaveBeenCalledWith({ role: 'member' });
      expect(updateWhere).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-1'))
      );
      expect(getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('唯一の owner を member に変更しようとすると last-owner-protection を返し、更新しないこと', async () => {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn(() => ({
        where: updateWhere,
      }));
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
          set: updateSet,
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
  });

  describe('leaveOrganization', () => {
    it('owner が複数 owner の組織を自己脱退すると成功し、自身の所属を削除すること', async () => {
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
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
        delete: vi.fn(() => deleteChain),
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
        callback(tx as Parameters<Parameters<typeof db.transaction>[0]>[0])
      );

      const result = await leaveOrganization({ headers, slug });

      expect(result).toEqual({ ok: true });
      expect(tx.delete).toHaveBeenCalledWith(membership);
      expect(deleteChain.where).toHaveBeenCalledWith(
        and(eq(membership.organizationId, organizationId), eq(membership.userId, 'user-2'))
      );
      expect(getOrganizationMembers).not.toHaveBeenCalled();
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
});
