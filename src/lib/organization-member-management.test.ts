import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/organization-authz', () => ({
  requireOrganizationAccessBySlug: vi.fn(),
}));

vi.mock('@/lib/organization-lifecycle', () => ({
  getOrganizationMembers: vi.fn(),
}));

import { requireOrganizationAccessBySlug } from '@/lib/organization-authz';
import { getOrganizationMembers } from '@/lib/organization-lifecycle';
import { listMembersForViewer } from './organization-member-management';

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
});
