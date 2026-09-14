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
import { getOrganizationMembers } from '@/lib/organization-lifecycle';
import { ensureOwnerRemainsAfterChange, listMembersForViewer } from './organization-member-management';

function createLockedMembershipSelectChain<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    for: vi.fn(() => promise),
  };

  return chain;
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
});
