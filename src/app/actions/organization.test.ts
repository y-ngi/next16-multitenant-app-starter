import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrganizationAction,
  getUserOrganizationsAction,
  createInvitationAction,
  getInvitationsAction,
} from './organization';

// Mock the functions
vi.mock('@/lib/organization-lifecycle', () => ({
  createOrganization: vi.fn(),
  getUserOrganizations: vi.fn(),
  createInvitation: vi.fn(),
  getInvitations: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import {
  createOrganization,
  getUserOrganizations,
  createInvitation,
  getInvitations,
} from '@/lib/organization-lifecycle';
import { headers } from 'next/headers';

describe('Organization Server Actions', () => {
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
    (headers as any).mockResolvedValue(mockHeaders);
  });

  describe('createOrganizationAction', () => {
    it('正しいパラメータで createOrganization を呼び出すこと', async () => {
      const mockResult = {
        ok: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
        },
      };

      vi.mocked(createOrganization).mockResolvedValueOnce(mockResult);

      const result = await createOrganizationAction('Test Org', 'test-org');

      expect(createOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        name: 'Test Org',
        slug: 'test-org',
      });

      expect(result).toEqual(mockResult);
    });

    it('エラーを返すこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Organization creation failed',
      };

      vi.mocked(createOrganization).mockResolvedValueOnce(mockResult);

      const result = await createOrganizationAction('', 'test');

      expect(result.ok).toBe(false);
    });
  });

  describe('getUserOrganizationsAction', () => {
    it('正しいパラメータで getUserOrganizations を呼び出すこと', async () => {
      const mockResult = {
        ok: true,
        organizations: [
          {
            id: 'org-1',
            name: 'Test Org',
            slug: 'test-org',
            role: 'owner' as const,
            joinedAt: new Date(),
          },
        ],
      };

      vi.mocked(getUserOrganizations).mockResolvedValueOnce(mockResult);

      const result = await getUserOrganizationsAction();

      expect(getUserOrganizations).toHaveBeenCalledWith({
        headers: mockHeaders,
      });

      expect(result).toEqual(mockResult);
    });

    it('ユーザーの組織一覧を返すこと', async () => {
      const mockResult = {
        ok: true,
        organizations: [
          {
            id: 'org-1',
            name: 'Org 1',
            slug: 'org-1',
            role: 'owner' as const,
            joinedAt: new Date(),
          },
          {
            id: 'org-2',
            name: 'Org 2',
            slug: 'org-2',
            role: 'member' as const,
            joinedAt: new Date(),
          },
        ],
      };

      vi.mocked(getUserOrganizations).mockResolvedValueOnce(mockResult);

      const result = await getUserOrganizationsAction();

      expect(result.ok).toBe(true);
      expect(result.organizations).toHaveLength(2);
    });

    it('認証されていない場合、エラーを返すこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Unauthenticated',
      };

      vi.mocked(getUserOrganizations).mockResolvedValueOnce(mockResult);

      const result = await getUserOrganizationsAction();

      expect(result.ok).toBe(false);
    });
  });

  describe('createInvitationAction', () => {
    it('正しいパラメータで createInvitation を呼び出すこと', async () => {
      const mockResult = {
        ok: true,
        invitation: {
          id: 'inv-1',
          email: 'newuser@example.com',
          status: 'pending' as const,
          token: 'token-123',
          inviteLink: 'https://localhost:3000/invitations/accept?token=token-123',
          expiresAt: new Date('2024-12-31'),
          createdAt: new Date(),
        },
        mailSent: true,
      };

      vi.mocked(createInvitation).mockResolvedValueOnce(mockResult);

      const result = await createInvitationAction('org-1', 'newuser@example.com');

      expect(createInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        organizationId: 'org-1',
        email: 'newuser@example.com',
        baseURL: expect.any(String),
      });

      expect(result).toEqual(mockResult);
    });

    it('招待作成に失敗してエラーを返すこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Only organization owners can create invitations',
      };

      vi.mocked(createInvitation).mockResolvedValueOnce(mockResult);

      const result = await createInvitationAction('org-1', 'newuser@example.com');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Only organization owners can create invitations');
    });

    it('メール送信失敗時も招待を返すこと', async () => {
      const mockResult = {
        ok: true,
        invitation: {
          id: 'inv-1',
          email: 'newuser@example.com',
          status: 'pending' as const,
          token: 'token-123',
          inviteLink: 'https://localhost:3000/invitations/accept?token=token-123',
          expiresAt: new Date('2024-12-31'),
          createdAt: new Date(),
        },
        mailSent: false,
      };

      vi.mocked(createInvitation).mockResolvedValueOnce(mockResult);

      const result = await createInvitationAction('org-1', 'newuser@example.com');

      expect(result.ok).toBe(true);
      expect(result.mailSent).toBe(false);
    });
  });

  describe('getInvitationsAction', () => {
    it('正しいパラメータで getInvitations を呼び出すこと', async () => {
      const mockResult = {
        ok: true,
        invitations: [
          {
            id: 'inv-1',
            email: 'user1@example.com',
            role: 'member',
            status: 'pending',
            inviteLink: 'https://localhost:3000/invitations/accept?token=token-123',
            createdAt: new Date(),
            expiresAt: new Date('2024-12-31'),
          },
          {
            id: 'inv-2',
            email: 'user2@example.com',
            role: 'member',
            status: 'accepted',
            inviteLink: 'https://localhost:3000/invitations/accept?token=token-456',
            createdAt: new Date(),
            expiresAt: new Date('2024-12-31'),
          },
        ],
      };

      vi.mocked(getInvitations).mockResolvedValueOnce(mockResult);

      const result = await getInvitationsAction('org-1');

      expect(getInvitations).toHaveBeenCalledWith({
        headers: mockHeaders,
        organizationId: 'org-1',
      });

      expect(result).toEqual(mockResult);
    });

    it('招待一覧取得に失敗してエラーを返すこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Only organization owners can view invitations',
      };

      vi.mocked(getInvitations).mockResolvedValueOnce(mockResult);

      const result = await getInvitationsAction('org-1');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Only organization owners can view invitations');
    });

    it('空の招待一覧を返すこと', async () => {
      const mockResult = {
        ok: true,
        invitations: [],
      };

      vi.mocked(getInvitations).mockResolvedValueOnce(mockResult);

      const result = await getInvitationsAction('org-1');

      expect(result.ok).toBe(true);
      expect(result.invitations).toHaveLength(0);
    });
  });
});
