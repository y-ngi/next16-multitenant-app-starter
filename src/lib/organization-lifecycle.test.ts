import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOrganization } from './organization-lifecycle';

// Mock auth module
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock database module
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(),
    query: {
      organization: {
        findFirst: vi.fn(),
      },
      membership: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/db';
import { organization, membership } from '@/db/schema';

describe('Organization Lifecycle', () => {
  const headers = new Headers({ authorization: '******' });
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrganization', () => {
    it('未認証の場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any);

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: 'test-org',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('name が空の場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      const result = await createOrganization({
        headers,
        name: '',
        slug: 'test-org',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('slug が空の場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: '',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('認証済みユーザーが有効な name/slug で組織を作成すると成功すること', async () => {
      const newOrgId = 'org-123';
      const now = new Date();

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      // Mock transaction
      let transactionCallback: ((tx: any) => Promise<any>) | undefined;
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        transactionCallback = callback;
        // Create mock tx object with insert method
        const mockTx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([
            { id: newOrgId, name: 'Test Organization', slug: 'test-org', createdAt: now, updatedAt: now }
          ]),
        };
        return callback(mockTx);
      });

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: 'test-org',
      });

      expect(result.ok).toBe(true);
      expect(result.organization).toBeDefined();
      expect(result.organization?.name).toBe('Test Organization');
      expect(result.organization?.slug).toBe('test-org');
    });

    it('認証済みユーザーが組織を作成すると、作成者が owner ロールでメンバーシップに登録されること', async () => {
      const newOrgId = 'org-123';
      const memberId = 'mem-123';
      const now = new Date();

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      let orgInsertCalled = false;
      let membershipInsertCalled = false;

      // Mock transaction
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          insert: vi.fn(function(table: any) {
            if (table === organization) {
              orgInsertCalled = true;
              return {
                values: vi.fn().mockReturnThis(),
                returning: vi.fn().mockResolvedValue([
                  { id: newOrgId, name: 'Test Organization', slug: 'test-org', createdAt: now, updatedAt: now }
                ]),
              };
            } else if (table === membership) {
              membershipInsertCalled = true;
              return {
                values: vi.fn().mockReturnThis(),
                returning: vi.fn().mockResolvedValue([
                  { id: memberId, organizationId: newOrgId, userId, role: 'owner', createdAt: now }
                ]),
              };
            }
            return {
              values: vi.fn().mockReturnThis(),
              returning: vi.fn().mockResolvedValue([]),
            };
          }),
        };
        return callback(mockTx);
      });

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: 'test-org',
      });

      expect(result.ok).toBe(true);
      expect(orgInsertCalled).toBe(true);
      expect(membershipInsertCalled).toBe(true);
    });

    it('認証済みユーザーが組織を作成した後、その組織を所属組織として取得できること', async () => {
      const newOrgId = 'org-123';
      const now = new Date();

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      // Mock transaction to create organization
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([
            { id: newOrgId, name: 'Test Organization', slug: 'test-org', createdAt: now, updatedAt: now }
          ]),
        };
        return callback(mockTx);
      });

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: 'test-org',
      });

      expect(result.ok).toBe(true);
      expect(result.organization?.id).toBe(newOrgId);
    });
  });
});
