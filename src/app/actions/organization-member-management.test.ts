import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelInvitationAction,
  changeMemberRoleAction,
  deleteOrganizationAction,
  leaveOrganizationAction,
  removeMemberAction,
} from './organization-member-management';
import type { OrganizationRole } from '@/lib/organization-member-management';
import {
  cancelInvitation,
  changeMemberRole,
  deleteOrganization,
  leaveOrganization,
  removeMember,
} from '@/lib/organization-member-management';
import { headers } from 'next/headers';

vi.mock('@/lib/organization-member-management', () => ({
  removeMember: vi.fn(),
  changeMemberRole: vi.fn(),
  cancelInvitation: vi.fn(),
  leaveOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

describe('Organization member management server actions', () => {
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(mockHeaders);
  });

  describe('removeMemberAction', () => {
    it('headers を取得し、サービスの成功結果をそのまま返すこと', async () => {
      const mockResult = {
        ok: true as const,
        members: [
          {
            id: 'membership-1',
            userId: 'user-2',
            userName: 'Alice',
            userEmail: 'alice@example.com',
            displayName: 'Alice',
            role: 'member' as const,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      };

      vi.mocked(removeMember).mockResolvedValueOnce(mockResult);

      const result = await removeMemberAction('acme', 'user-2');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(removeMember).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        targetUserId: 'user-2',
      });
      expect(result).toEqual(mockResult);
    });

    it('サービスの失敗結果をそのまま返すこと', async () => {
      const mockResult = {
        ok: false as const,
        reason: 'last-owner-protection' as const,
      };

      vi.mocked(removeMember).mockResolvedValueOnce(mockResult);

      const result = await removeMemberAction('acme', 'user-1');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(removeMember).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        targetUserId: 'user-1',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('changeMemberRoleAction', () => {
    it('headers を取得し、サービスへロール変更を委譲すること', async () => {
      const newRole: OrganizationRole = 'owner';
      const mockResult = {
        ok: true as const,
        members: [
          {
            id: 'membership-1',
            userId: 'user-2',
            userName: 'Bob',
            userEmail: 'bob@example.com',
            displayName: 'Bob',
            role: newRole,
            joinedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ],
      };

      vi.mocked(changeMemberRole).mockResolvedValueOnce(mockResult);

      const result = await changeMemberRoleAction('acme', 'user-2', newRole);

      expect(headers).toHaveBeenCalledTimes(1);
      expect(changeMemberRole).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        targetUserId: 'user-2',
        newRole,
      });
      expect(result).toEqual(mockResult);
    });

    it('サービスの失敗結果をそのまま返すこと', async () => {
      const newRole: OrganizationRole = 'member';
      const mockResult = {
        ok: false as const,
        reason: 'insufficient-role' as const,
      };

      vi.mocked(changeMemberRole).mockResolvedValueOnce(mockResult);

      const result = await changeMemberRoleAction('acme', 'user-2', newRole);

      expect(headers).toHaveBeenCalledTimes(1);
      expect(changeMemberRole).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        targetUserId: 'user-2',
        newRole,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('cancelInvitationAction', () => {
    it('headers を取得し、サービスへ招待キャンセルを委譲すること', async () => {
      const mockResult = {
        ok: true as const,
      };

      vi.mocked(cancelInvitation).mockResolvedValueOnce(mockResult);

      const result = await cancelInvitationAction('acme', 'invitation-1');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(cancelInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        invitationId: 'invitation-1',
      });
      expect(result).toEqual(mockResult);
    });

    it('サービスの失敗結果をそのまま返すこと', async () => {
      const mockResult = {
        ok: false as const,
        reason: 'insufficient-role' as const,
      };

      vi.mocked(cancelInvitation).mockResolvedValueOnce(mockResult);

      const result = await cancelInvitationAction('acme', 'invitation-1');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(cancelInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
        invitationId: 'invitation-1',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('leaveOrganizationAction', () => {
    it('headers を取得し、サービスへ脱退処理を委譲すること', async () => {
      const mockResult = {
        ok: true as const,
      };

      vi.mocked(leaveOrganization).mockResolvedValueOnce(mockResult);

      const result = await leaveOrganizationAction('acme');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(leaveOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
      });
      expect(result).toEqual(mockResult);
    });

    it('サービスの失敗結果をそのまま返すこと', async () => {
      const mockResult = {
        ok: false as const,
        reason: 'insufficient-role' as const,
      };

      vi.mocked(leaveOrganization).mockResolvedValueOnce(mockResult);

      const result = await leaveOrganizationAction('acme');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(leaveOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('deleteOrganizationAction', () => {
    it('headers を取得し、サービスへ組織削除を委譲すること', async () => {
      const mockResult = {
        ok: true as const,
      };

      vi.mocked(deleteOrganization).mockResolvedValueOnce(mockResult);

      const result = await deleteOrganizationAction('acme');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(deleteOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
      });
      expect(result).toEqual(mockResult);
    });

    it('サービスの失敗結果をそのまま返すこと', async () => {
      const mockResult = {
        ok: false as const,
        reason: 'insufficient-role' as const,
      };

      vi.mocked(deleteOrganization).mockResolvedValueOnce(mockResult);

      const result = await deleteOrganizationAction('acme');

      expect(headers).toHaveBeenCalledTimes(1);
      expect(deleteOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        slug: 'acme',
      });
      expect(result).toEqual(mockResult);
    });
  });
});
