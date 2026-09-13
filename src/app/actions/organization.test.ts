import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrganizationAction,
  getUserOrganizationsAction,
  createInvitationAction,
  getInvitationsAction,
  validateInvitationTokenAction,
  respondToInvitationAction,
} from './organization';

// Mock the functions
vi.mock('@/lib/organization-lifecycle', () => ({
  createOrganization: vi.fn(),
  getUserOrganizations: vi.fn(),
  createInvitation: vi.fn(),
  getInvitations: vi.fn(),
  validateInvitationToken: vi.fn(),
  respondToInvitation: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import {
  createOrganization,
  getUserOrganizations,
  createInvitation,
  getInvitations,
  validateInvitationToken,
  respondToInvitation,
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

  describe('validateInvitationTokenAction', () => {
    it('有効な招待トークンを検証できること', async () => {
      const mockResult = {
        valid: true,
        invitation: {
          id: 'inv-1',
          organizationId: 'org-1',
          organizationName: 'Test Org',
          email: 'user@example.com',
          role: 'member' as const,
        },
      };

      vi.mocked(validateInvitationToken).mockResolvedValueOnce(mockResult);

      const result = await validateInvitationTokenAction('valid-token');

      expect(validateInvitationToken).toHaveBeenCalledWith('valid-token');
      expect(result.valid).toBe(true);
      expect(result.invitation?.email).toBe('user@example.com');
    });

    it('期限切れの招待を識別すること', async () => {
      const mockResult = {
        valid: false,
        reason: 'expired' as const,
      };

      vi.mocked(validateInvitationToken).mockResolvedValueOnce(mockResult);

      const result = await validateInvitationTokenAction('expired-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('見つからない招待トークンを識別すること', async () => {
      const mockResult = {
        valid: false,
        reason: 'not-found' as const,
      };

      vi.mocked(validateInvitationToken).mockResolvedValueOnce(mockResult);

      const result = await validateInvitationTokenAction('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
    });

    it('既に使用された招待を識別すること', async () => {
      const mockResult = {
        valid: false,
        reason: 'already-used' as const,
      };

      vi.mocked(validateInvitationToken).mockResolvedValueOnce(mockResult);

      const result = await validateInvitationTokenAction('used-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already-used');
    });

    it('キャンセルされた招待を識別すること', async () => {
      const mockResult = {
        valid: false,
        reason: 'canceled' as const,
      };

      vi.mocked(validateInvitationToken).mockResolvedValueOnce(mockResult);

      const result = await validateInvitationTokenAction('canceled-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('canceled');
    });
  });

  describe('respondToInvitationAction', () => {
    it('招待を承諾できること', async () => {
      const mockResult = {
        ok: true,
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('valid-token', true);

      expect(respondToInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        token: 'valid-token',
        accept: true,
      });

      expect(result.ok).toBe(true);
    });

    it('招待を拒否できること', async () => {
      const mockResult = {
        ok: true,
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('valid-token', false);

      expect(respondToInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        token: 'valid-token',
        accept: false,
      });

      expect(result.ok).toBe(true);
    });

    it('認証されていないユーザーは招待に応答できないこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Unauthenticated user cannot respond to invitation',
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('valid-token', true);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unauthenticated user cannot respond to invitation');
    });

    it('メールアドレスが一致しない場合、特定のエラーメッセージを返すこと', async () => {
      const mockResult = {
        ok: false,
        error: '他のユーザへの招待ですので、招待されたメールアドレスで再ログインしてください。',
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('valid-token', true);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('招待されたメールアドレスで再ログインしてください');
    });

    it('期限切れの招待には応答できないこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Invitation has expired',
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('expired-token', true);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invitation has expired');
    });

    it('既に使用された招待には応答できないこと', async () => {
      const mockResult = {
        ok: false,
        error: 'Invitation has already been used',
      };

      vi.mocked(respondToInvitation).mockResolvedValueOnce(mockResult);

      const result = await respondToInvitationAction('used-token', true);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invitation has already been used');
    });
  });
});

