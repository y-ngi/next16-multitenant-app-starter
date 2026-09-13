import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrganizationAction, getUserOrganizationsAction } from './organization';

// Mock the functions
vi.mock('@/lib/organization-lifecycle', () => ({
  createOrganization: vi.fn(),
  getUserOrganizations: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { createOrganization, getUserOrganizations } from '@/lib/organization-lifecycle';
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
});
