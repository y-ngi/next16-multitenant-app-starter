import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createOrganization,
  createInvitation,
  validateInvitationToken,
  respondToInvitation,
  getInvitations,
  getUserOrganizations,
  getOrganizationMembers,
} from './organization-lifecycle';

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
    select: vi.fn(),
    query: {
      organization: {
        findFirst: vi.fn(),
      },
      membership: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      invitation: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock invitation mailer
vi.mock('@/lib/invitation-mailer', () => ({
  sendInvitationEmail: vi.fn(),
  sendAcceptanceNotificationEmail: vi.fn(),
}));

// Mock organization authz
vi.mock('@/lib/organization-authz', () => ({
  requireOrganizationAccess: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { db } from '@/db';
import { organization, membership } from '@/db/schema';
import { sendInvitationEmail, sendAcceptanceNotificationEmail } from '@/lib/invitation-mailer';
import { requireOrganizationAccess } from '@/lib/organization-authz';

function createSelectChain<T>(rows: T[], error?: Error) {
  const promise = error ? Promise.reject(error) : Promise.resolve(rows);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };

  return chain;
}

function mockSelectOnce<T>(rows: T[]) {
  vi.mocked(db.select).mockReturnValueOnce(createSelectChain(rows) as any);
}

function mockSelectRejectOnce(error: Error) {
  vi.mocked(db.select).mockReturnValueOnce(createSelectChain([], error) as any);
}

function mockUpdateOnce(result: unknown = undefined, onSet?: (values: any) => void) {
  const where = vi.fn().mockResolvedValue(result);
  const set = vi.fn().mockImplementation((inputValues: any) => {
    onSet?.(inputValues);
    return { where };
  });

  vi.mocked(db.update).mockReturnValueOnce({ set } as any);

  return { set, where };
}

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

      mockSelectOnce([]);

      // Mock transaction
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
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

      mockSelectOnce([]);

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

      mockSelectOnce([]);

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

    it('slug が重複している場合、分かりやすいエラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: 'existing-org-id',
        name: 'Existing Org',
        slug: 'test-org',
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      const result = await createOrganization({
        headers,
        name: 'Test Organization',
        slug: 'test-org',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('既に使用されています');
    });
  });

  describe('createInvitation', () => {
    const organizationId = 'org-123';
    const inviteeEmail = 'invitee@example.com';
    const inviterName = 'John Doe';
    const organizationName = 'Test Organization';
    const baseURL = 'http://localhost:3000';
    const invitationId = 'inv-123';
    const token = 'token-uuid-123456';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('owner でない場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to return insufficient-role
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      } as any);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('owner');
    });

    it('未認証の場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to return unauthenticated
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'unauthenticated',
      } as any);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('招待先メールアドレスがすでに組織のメンバーの場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock findMany to find existing user in membership by email
      const existingUser = {
        id: 'existing-user-id',
        name: 'Existing Member',
        email: inviteeEmail,
        emailVerified: true,
        image: null,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const existingMembership = {
        id: 'mem-123',
        organizationId,
        userId: 'existing-user-id',
        role: 'member' as const,
        displayName: null,
        createdAt: new Date(),
        user: existingUser,
      };

      mockSelectOnce([existingMembership] as any);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('既に組織に所属');
    });

    it('同一宛先への有効な未受諾招待が存在する場合、旧招待を canceled に更新し新しい招待を発行すること', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock membership findMany to return empty array (not a member)
      mockSelectOnce([]);

      // Mock existing pending invitation
      const existingInvitation = {
        id: 'inv-old',
        organizationId,
        email: inviteeEmail,
        token: 'old-token',
        status: 'pending',
        inviterId: userId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'member',
      };

      mockSelectOnce([{ id: existingInvitation.id }]);

      // Mock update chain for canceling old invitation - verify status transition
      let updateCalled = false;
      let updateSetCalled = false;
      let updateWhereCalled = false;
      let updateStatusValue: string | undefined;
      
      const mockUpdateChain = {
        set: vi.fn().mockImplementation((values: any) => {
          updateSetCalled = true;
          // Capture the status being set
          if (values && typeof values === 'object' && 'status' in values) {
            updateStatusValue = values.status;
          }
          return mockUpdateChain;
        }),
        where: vi.fn().mockImplementation(() => {
          updateWhereCalled = true;
          return Promise.resolve(undefined);
        }),
      };
      vi.mocked(db.update).mockImplementation(() => {
        updateCalled = true;
        return mockUpdateChain as any;
      });

      // Mock insert chain for new invitation - capture the token from values
      const newInvDate = new Date();
      let insertCalled = false;
      let insertNewStatus: string | undefined;
      
      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => {
          insertCalled = true;
          if (values && typeof values === 'object' && 'status' in values) {
            insertNewStatus = values.status;
          }
          return {
            returning: vi.fn().mockResolvedValue([{
              id: invitationId,
              organizationId,
              email: inviteeEmail,
              token: values.token,  // Use the token from the implementation
              status: 'pending',
              inviterId: userId,
              expiresAt: values.expiresAt,
              createdAt: newInvDate,
              updatedAt: newInvDate,
              role: 'member',
            }]),
          };
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      mockSelectOnce([]);
      mockSelectOnce([]);
      mockSelectOnce([]); // existingUserRows check (not an existing account)

      // Mock mail sending success
      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      // Verify old invitation was updated to 'canceled'
      expect(updateCalled).toBe(true);
      expect(updateSetCalled).toBe(true);
      expect(updateWhereCalled).toBe(true);
      expect(updateStatusValue).toBe('canceled');
      
      // Verify new invitation was created with 'pending' status
      expect(insertCalled).toBe(true);
      expect(insertNewStatus).toBe('pending');
      
      // Verify the invitation result
      expect(result.ok).toBe(true);
      expect(result.mailSent).toBe(true);
      expect(result.invitation).toBeDefined();
      expect(result.invitation?.status).toBe('pending');
      expect(result.invitation?.inviteLink).toContain(baseURL);
      expect(result.invitation?.inviteLink).toContain('token=');
      // Verify the token in the link matches the returned token
      expect(result.invitation?.inviteLink).toContain(result.invitation?.token);
    });

    it('招待作成後、メール送信に失敗した場合、招待は pending のまま維持され、inviteLink が返されること', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock membership findMany to return empty array (not a member)
      mockSelectOnce([]);

      // Mock no existing invitation
      mockSelectOnce([]);

      // Mock insert chain for new invitation - capture the token from values
      const newInvDate = new Date();
      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => {
          return {
            returning: vi.fn().mockResolvedValue([{
              id: invitationId,
              organizationId,
              email: inviteeEmail,
              token: values.token,  // Use the token from the implementation
              status: 'pending',
              inviterId: userId,
              expiresAt: values.expiresAt,
              createdAt: newInvDate,
              updatedAt: newInvDate,
              role: 'member',
            }]),
          };
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      mockSelectOnce([]);
      mockSelectOnce([]);
      mockSelectOnce([]); // existingUserRows check (not an existing account)

      // Mock mail sending failure
      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(false);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      expect(result.mailSent).toBe(false);
      expect(result.invitation).toBeDefined();
      expect(result.invitation?.status).toBe('pending');
      expect(result.invitation?.inviteLink).toContain(baseURL);
      expect(result.invitation?.inviteLink).toContain('token=');
      // Verify the token in the link matches the returned token
      expect(result.invitation?.inviteLink).toContain(result.invitation?.token);
    });

    it('招待作成後、メール送信に成功した場合、ok: true, mailSent: true を返すこと', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock membership findMany to return empty array (not a member)
      mockSelectOnce([]);

      // Mock no existing invitation
      mockSelectOnce([]);

      // Mock user query to get inviter name
      mockSelectOnce([{
        id: userId,
        name: inviterName,
        email: 'inviter@example.com',
        emailVerified: true,
        image: null,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      // Mock insert chain for new invitation
      const newInvDate = new Date();
      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{
          id: invitationId,
          organizationId,
          email: inviteeEmail,
          token,
          status: 'pending',
          inviterId: userId,
          expiresAt: new Date(newInvDate.getTime() + 14 * 24 * 60 * 60 * 1000),
          createdAt: newInvDate,
          updatedAt: newInvDate,
          role: 'member',
        }]),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      // Mock mail sending success
      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      // Mock organization query to get organization name
      mockSelectOnce([{
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);

      // Mock existingUserRows check (not an existing account)
      mockSelectOnce([]);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      expect(result.mailSent).toBe(true);
      expect(result.invitation).toBeDefined();
      expect(result.invitation?.status).toBe('pending');
      expect(result.invitation?.inviteLink).toContain(baseURL);
    });

    it('招待発行から14日間で有効期限が設定されること', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock membership findMany to return empty array (not a member)
      mockSelectOnce([]);

      // Mock no existing invitation
      mockSelectOnce([]);

      mockSelectOnce([]);
      mockSelectOnce([]);
      mockSelectOnce([]); // existingUserRows check (not an existing account)

      const now = Date.now();
      const expectedExpiry = new Date(now + 14 * 24 * 60 * 60 * 1000);

      // Capture the inserted invitation
      let capturedInvitation: any;
      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => {
          capturedInvitation = values;
          return {
            returning: vi.fn().mockResolvedValue([{
              id: invitationId,
              ...values,
              createdAt: new Date(),
              updatedAt: new Date(),
            }]),
          };
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      // Mock mail sending success
      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      if (capturedInvitation) {
        const expiresAtTime = capturedInvitation.expiresAt.getTime();
        // Allow for 1 minute variance due to test execution time
        expect(expiresAtTime).toBeGreaterThanOrEqual(expectedExpiry.getTime() - 60000);
        expect(expiresAtTime).toBeLessThanOrEqual(expectedExpiry.getTime() + 60000);
      }
    });

    it('招待トークンは一意であること', async () => {
      // Mock requireOrganizationAccess to return success
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock membership findMany to return empty array (not a member)
      mockSelectOnce([]);

      // Mock no existing invitation
      mockSelectOnce([]);

      mockSelectOnce([]);
      mockSelectOnce([]);
      mockSelectOnce([]); // existingUserRows check (not an existing account)

      // Capture the inserted invitation
      let capturedToken: string | undefined;
      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => {
          capturedToken = values.token;
          return {
            returning: vi.fn().mockResolvedValue([{
              id: invitationId,
              ...values,
              createdAt: new Date(),
              updatedAt: new Date(),
            }]),
          };
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      // Mock mail sending success
      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      expect(capturedToken).toBeDefined();
      // UUID format check (basic)
      expect(capturedToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('招待先メールアドレスが既存アカウントの場合、ログイン導線のリンクでメールを送信すること', async () => {
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      mockSelectOnce([]); // not a member
      mockSelectOnce([]); // no existing invitation

      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => ({
          returning: vi.fn().mockResolvedValue([{
            id: invitationId,
            ...values,
            createdAt: new Date(),
            updatedAt: new Date(),
          }]),
        })),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      mockSelectOnce([{ name: inviterName }]); // inviter
      mockSelectOnce([{ name: organizationName }]); // organization
      mockSelectOnce([{ id: 'existing-user-id' }]); // existingUserRows: found

      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          isExistingUser: true,
          actionLink: expect.stringContaining('/login?email='),
        })
      );
      const callArgs = vi.mocked(sendInvitationEmail).mock.calls[0][0];
      expect(callArgs.actionLink).not.toContain('mode=signup');
    });

    it('招待先メールアドレスが未登録の場合、新規登録導線のリンクでメールを送信すること', async () => {
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      mockSelectOnce([]); // not a member
      mockSelectOnce([]); // no existing invitation

      const mockInsertChain = {
        values: vi.fn().mockImplementation((values: any) => ({
          returning: vi.fn().mockResolvedValue([{
            id: invitationId,
            ...values,
            createdAt: new Date(),
            updatedAt: new Date(),
          }]),
        })),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as any);

      mockSelectOnce([{ name: inviterName }]); // inviter
      mockSelectOnce([{ name: organizationName }]); // organization
      mockSelectOnce([]); // existingUserRows: not found

      vi.mocked(sendInvitationEmail).mockResolvedValueOnce(true);

      const result = await createInvitation({
        headers,
        organizationId,
        email: inviteeEmail,
        baseURL,
      });

      expect(result.ok).toBe(true);
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          isExistingUser: false,
          actionLink: expect.stringContaining('mode=signup'),
        })
      );
    });
  });

  describe('validateInvitationToken', () => {
    const invitationId = 'inv-123';
    const organizationId = 'org-123';
    const organizationName = 'Test Organization';
    const inviteeEmail = 'invitee@example.com';
    const token = 'token-uuid-123';

    it('有効な招待（pending かつ期限内）を検証できること', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: futureDate,
        role: 'member',
        inviterId: userId,
        createdAt: now,
        updatedAt: now,
      }]);

      mockSelectOnce([{
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.invitation).toBeDefined();
      expect(result.invitation?.id).toBe(invitationId);
      expect(result.invitation?.organizationId).toBe(organizationId);
      expect(result.invitation?.organizationName).toBe(organizationName);
      expect(result.invitation?.email).toBe(inviteeEmail);
      expect(result.invitation?.role).toBe('member');
    });

    it('存在しないトークンの場合 not-found を返すこと', async () => {
      mockSelectOnce([]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
      expect(result.invitation).toBeUndefined();
    });

    it('期限切れ招待の場合 expired を返すこと', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day in the past

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: pastDate,
        role: 'member',
        inviterId: userId,
        createdAt: new Date(pastDate.getTime() - 15 * 24 * 60 * 60 * 1000),
        updatedAt: pastDate,
      }]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
      expect(result.invitation).toBeUndefined();
    });

    it('使用済み招待（accepted）の場合 already-used を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'accepted',
        expiresAt: futureDate,
        role: 'member',
        inviterId: userId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already-used');
      expect(result.invitation).toBeUndefined();
    });

    it('使用済み招待（rejected）の場合 already-used を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'rejected',
        expiresAt: futureDate,
        role: 'member',
        inviterId: userId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already-used');
      expect(result.invitation).toBeUndefined();
    });

    it('キャンセル済み招待の場合 canceled を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'canceled',
        expiresAt: futureDate,
        role: 'member',
        inviterId: userId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('canceled');
      expect(result.invitation).toBeUndefined();
    });
  });

  describe('respondToInvitation', () => {
    const inviteeEmail = 'invitee@example.com';
    const inviterEmail = 'inviter@example.com';
    const inviterId = 'inviter-user-id';
    const token = 'valid-token-123';
    const invitationId = 'invitation-id-456';
    const organizationId = 'org-789';
    const organizationName = 'Test Organization';

    it('未認証の場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('招待が見つからない場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('招待が期限切れの場合、エラーを返すこと', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day in the past

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: pastDate,
        role: 'member',
        inviterId,
        createdAt: new Date(pastDate.getTime() - 15 * 24 * 60 * 60 * 1000),
        updatedAt: pastDate,
      }]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('招待が使用済み（accepted）の場合、エラーを返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'accepted',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('招待がキャンセル済みの場合、エラーを返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'canceled',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('ログインユーザーのメールアドレスが招待先と異なる場合、エラーを返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: 'different-user@example.com' },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('他のユーザへの招待です');
      expect(result.error).toContain('招待されたメールアドレスで再ログイン');
    });

    it('招待を承諾する場合、membership を作成し invitation を accepted に更新すること', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: 'membership-id-new' }]),
      });

      const mockUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        set: mockUpdateSet,
      });

      const mockTx = {
        insert: mockInsert,
        update: mockUpdate,
      };

      vi.mocked(db.transaction).mockImplementation(async (fn) => fn(mockTx as any));

      mockSelectOnce([{
        id: inviterId,
        email: inviterEmail,
        name: 'Inviter Name',
      }]);
      mockSelectOnce([{
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      }]);

      vi.mocked(sendAcceptanceNotificationEmail).mockResolvedValueOnce(true);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
      expect(db.transaction).toHaveBeenCalled();
      expect(sendAcceptanceNotificationEmail).toHaveBeenCalled();
    });

    it('招待を拒否する場合、membership を作成せず invitation を rejected に更新すること', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      mockUpdateOnce([]);

      const result = await respondToInvitation({
        headers,
        token,
        accept: false,
      });

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
      expect(db.update).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('承諾時にメール送信失敗してもエラーにしないこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId, email: inviteeEmail },
        session: { id: 'sess-1' },
      } as any);

      mockSelectOnce([{
        id: invitationId,
        organizationId,
        email: inviteeEmail,
        token,
        status: 'pending',
        expiresAt: futureDate,
        role: 'member',
        inviterId,
        createdAt: now,
        updatedAt: now,
      }]);

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: 'membership-id-new' }]),
      });

      const mockUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        set: mockUpdateSet,
      });

      const mockTx = {
        insert: mockInsert,
        update: mockUpdate,
      };

      vi.mocked(db.transaction).mockImplementation(async (fn) => fn(mockTx as any));

      mockSelectOnce([{
        id: inviterId,
        email: inviterEmail,
        name: 'Inviter Name',
      }]);
      mockSelectOnce([{
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      }]);

      // メール送信失敗
      vi.mocked(sendAcceptanceNotificationEmail).mockResolvedValueOnce(false);

      const result = await respondToInvitation({
        headers,
        token,
        accept: true,
      });

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
      expect(sendAcceptanceNotificationEmail).toHaveBeenCalled();
    });
  });

  describe('getInvitations', () => {
    const organizationId = 'org-123';
    const baseURL = 'https://example.com';

    it('owner が招待一覧を取得できることテスト', async () => {
      // Create headers with Origin
      const headersWithOrigin = new Headers({ 
        authorization: '******',
        origin: baseURL,
      });

      // Mock requireOrganizationAccess to return success with owner role
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock invitation list
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days in future (not expired)
      const mockInvitations = [
        {
          id: 'inv-1',
          email: 'user1@example.com',
          role: 'member',
          status: 'pending',
          token: 'token-1',
          createdAt: now,
          expiresAt: expiresAt,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
      ];

      mockSelectOnce(mockInvitations as any);

      const result = await getInvitations({
        headers: headersWithOrigin,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.invitations).toBeDefined();
      expect(result.invitations?.length).toBe(1);
      expect(result.invitations?.[0].id).toBe('inv-1');
      expect(result.invitations?.[0].email).toBe('user1@example.com');
      expect(result.invitations?.[0].role).toBe('member');
      expect(result.invitations?.[0].status).toBe('pending');
      expect(result.invitations?.[0].inviteLink).toBe(`${baseURL}/invitations/accept?token=token-1`);
    });

    it('非 owner ユーザーが招待一覧の取得を要求した場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to return insufficient-role error
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'insufficient-role',
      } as any);

      const result = await getInvitations({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.invitations).toBeUndefined();
    });

    it('未認証ユーザーが招待一覧の取得を要求した場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to return unauthenticated error
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'unauthenticated',
      } as any);

      const result = await getInvitations({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.invitations).toBeUndefined();
    });

    it('期限切れ招待が実効ステータス "expired" として返されること', async () => {
      // Create headers with Origin
      const headersWithOrigin = new Headers({ 
        authorization: '******',
        origin: baseURL,
      });

      // Mock requireOrganizationAccess to return success with owner role
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      // Mock invitation list with expired invitation
      const now = new Date();
      const expiresAtPast = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day in past (expired)
      const mockInvitations = [
        {
          id: 'inv-1',
          email: 'user1@example.com',
          role: 'member',
          status: 'pending', // DB status is 'pending'
          token: 'token-1',
          createdAt: now,
          expiresAt: expiresAtPast, // But expiresAt is in the past
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
      ];

      mockSelectOnce(mockInvitations as any);

      const result = await getInvitations({
        headers: headersWithOrigin,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.invitations).toBeDefined();
      expect(result.invitations?.length).toBe(1);
      expect(result.invitations?.[0].status).toBe('expired'); // Returned as 'expired'
    });

    it('複数の招待（pending, accepted, rejected, canceled, expired）が混在する場合、それぞれ正しいステータスが返されること', async () => {
      // Create headers with Origin
      const headersWithOrigin = new Headers({ 
        authorization: '******',
        origin: baseURL,
      });

      // Mock requireOrganizationAccess to return success with owner role
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const pastExpiry = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      const mockInvitations = [
        {
          id: 'inv-pending',
          email: 'pending@example.com',
          role: 'member',
          status: 'pending',
          token: 'token-pending',
          createdAt: now,
          expiresAt: futureExpiry,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
        {
          id: 'inv-accepted',
          email: 'accepted@example.com',
          role: 'member',
          status: 'accepted',
          token: 'token-accepted',
          createdAt: now,
          expiresAt: futureExpiry,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
        {
          id: 'inv-rejected',
          email: 'rejected@example.com',
          role: 'member',
          status: 'rejected',
          token: 'token-rejected',
          createdAt: now,
          expiresAt: futureExpiry,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
        {
          id: 'inv-canceled',
          email: 'canceled@example.com',
          role: 'member',
          status: 'canceled',
          token: 'token-canceled',
          createdAt: now,
          expiresAt: futureExpiry,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
        {
          id: 'inv-expired',
          email: 'expired@example.com',
          role: 'member',
          status: 'pending',
          token: 'token-expired',
          createdAt: now,
          expiresAt: pastExpiry,
          organizationId,
          inviterId: userId,
          updatedAt: now,
        },
      ];

      mockSelectOnce(mockInvitations as any);

      const result = await getInvitations({
        headers: headersWithOrigin,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.invitations?.length).toBe(5);

      // Check each invitation has the correct status
      const invitationsByEmail = (result.invitations || []).reduce(
        (acc, inv) => {
          acc[inv.email] = inv;
          return acc;
        },
        {} as Record<string, any>
      );

      expect(invitationsByEmail['pending@example.com'].status).toBe('pending');
      expect(invitationsByEmail['accepted@example.com'].status).toBe('accepted');
      expect(invitationsByEmail['rejected@example.com'].status).toBe('rejected');
      expect(invitationsByEmail['canceled@example.com'].status).toBe('canceled');
      expect(invitationsByEmail['expired@example.com'].status).toBe('expired');
    });
  });

  describe('getUserOrganizations', () => {
    it('未認証の場合、エラーを返すこと', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any);

      const result = await getUserOrganizations({
        headers,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unauthenticated');
      expect(result.organizations).toBeUndefined();
    });

    it('認証済みユーザーが所属組織一覧を取得できること', async () => {
      // Mock auth session
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
      } as any);

      const now = new Date();
      const orgId1 = 'org-1';
      const orgId2 = 'org-2';
      const mockRows = [
        {
          id: orgId1,
          name: 'Test Org 1',
          slug: 'test-org-1',
          role: 'owner',
          joinedAt: now,
        },
        {
          id: orgId2,
          name: 'Test Org 2',
          slug: 'test-org-2',
          role: 'member',
          joinedAt: new Date(now.getTime() + 1000),
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserOrganizations({
        headers,
      });

      expect(result.ok).toBe(true);
      expect(result.organizations).toBeDefined();
      expect(result.organizations?.length).toBe(2);

      // Check first organization
      expect(result.organizations?.[0].id).toBe(orgId1);
      expect(result.organizations?.[0].name).toBe('Test Org 1');
      expect(result.organizations?.[0].slug).toBe('test-org-1');
      expect(result.organizations?.[0].role).toBe('owner');
      expect(result.organizations?.[0].joinedAt).toEqual(now);

      // Check second organization
      expect(result.organizations?.[1].id).toBe(orgId2);
      expect(result.organizations?.[1].name).toBe('Test Org 2');
      expect(result.organizations?.[1].slug).toBe('test-org-2');
      expect(result.organizations?.[1].role).toBe('member');
      expect(result.organizations?.[1].joinedAt).toEqual(new Date(now.getTime() + 1000));
    });

    it('所属組織がない場合、空配列を返すこと', async () => {
      // Mock auth session
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
      } as any);

      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserOrganizations({
        headers,
      });

      expect(result.ok).toBe(true);
      expect(result.organizations).toBeDefined();
      expect(result.organizations?.length).toBe(0);
    });

    it('複数の所属組織を正しい順序で返すこと', async () => {
      // Mock auth session
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
      } as any);

      const now = new Date();
      const mockRows = [
        {
          id: 'org-1',
          name: 'First Org',
          slug: 'first-org',
          role: 'owner',
          joinedAt: now,
        },
        {
          id: 'org-2',
          name: 'Second Org',
          slug: 'second-org',
          role: 'member',
          joinedAt: new Date(now.getTime() + 1000),
        },
        {
          id: 'org-3',
          name: 'Third Org',
          slug: 'third-org',
          role: 'member',
          joinedAt: new Date(now.getTime() + 2000),
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserOrganizations({
        headers,
      });

      expect(result.ok).toBe(true);
      expect(result.organizations?.length).toBe(3);
      expect(result.organizations?.[0].name).toBe('First Org');
      expect(result.organizations?.[1].name).toBe('Second Org');
      expect(result.organizations?.[2].name).toBe('Third Org');
    });

    it('DB クエリエラーが発生した場合、エラーメッセージを返すこと', async () => {
      // Mock auth session
      vi.mocked(auth.api.getSession).mockResolvedValueOnce({
        user: { id: userId },
      } as any);

      mockSelectRejectOnce(new Error('Database error'));

      const result = await getUserOrganizations({
        headers,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.organizations).toBeUndefined();
    });
  });

  describe('getOrganizationMembers', () => {
    const organizationId = 'org-123';

    it('未認証の場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to fail with unauthenticated
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'unauthenticated',
      } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.members).toBeUndefined();

      // Verify requireOrganizationAccess was called with 'member' role requirement
      expect(requireOrganizationAccess).toHaveBeenCalledWith({
        headers,
        organizationId,
        requiredRole: 'member',
      });
    });

    it('非メンバーが組織メンバー一覧にアクセスしようとした場合、エラーを返すこと', async () => {
      // Mock requireOrganizationAccess to fail with not-member
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: false,
        reason: 'not-member',
      } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.members).toBeUndefined();
    });

    it('メンバーが所属組織のメンバー一覧を取得できること', async () => {
      // Mock requireOrganizationAccess to succeed
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'member',
      } as any);

      const now = new Date();
      const mockRows = [
        {
          id: 'mem-1',
          userId: 'user-1',
          userName: 'Alice Johnson',
          userEmail: 'alice@example.com',
          displayName: 'Alice',
          role: 'owner',
          joinedAt: now,
        },
        {
          id: 'mem-2',
          userId: 'user-2',
          userName: 'Bob Smith',
          userEmail: 'bob@example.com',
          displayName: 'Bob',
          role: 'member',
          joinedAt: new Date(now.getTime() + 1000),
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.members).toBeDefined();
      expect(result.members?.length).toBe(2);

      // Check first member
      expect(result.members?.[0].id).toBe('mem-1');
      expect(result.members?.[0].userId).toBe('user-1');
      expect(result.members?.[0].userName).toBe('Alice Johnson');
      expect(result.members?.[0].userEmail).toBe('alice@example.com');
      expect(result.members?.[0].displayName).toBe('Alice');
      expect(result.members?.[0].role).toBe('owner');
      expect(result.members?.[0].joinedAt).toEqual(now);

      // Check second member
      expect(result.members?.[1].id).toBe('mem-2');
      expect(result.members?.[1].userId).toBe('user-2');
      expect(result.members?.[1].userName).toBe('Bob Smith');
      expect(result.members?.[1].userEmail).toBe('bob@example.com');
      expect(result.members?.[1].displayName).toBe('Bob');
      expect(result.members?.[1].role).toBe('member');
      expect(result.members?.[1].joinedAt).toEqual(new Date(now.getTime() + 1000));
    });

    it('メンバーのない組織を照会した場合、空配列を返すこと', async () => {
      // Mock requireOrganizationAccess to succeed
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'member',
      } as any);

      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.members).toBeDefined();
      expect(result.members?.length).toBe(0);
    });

    it('displayName が null の場合、正しく処理すること', async () => {
      // Mock requireOrganizationAccess to succeed
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'member',
      } as any);

      const now = new Date();
      const mockRows = [
        {
          id: 'mem-1',
          userId: 'user-1',
          userName: 'Charlie Brown',
          userEmail: 'charlie@example.com',
          displayName: null,
          role: 'member',
          joinedAt: now,
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.members?.length).toBe(1);
      expect(result.members?.[0].displayName).toBeNull();
    });

    it('複数のメンバーを正しい順序で返すこと', async () => {
      // Mock requireOrganizationAccess to succeed
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'member',
      } as any);

      const now = new Date();
      const mockRows = [
        {
          id: 'mem-1',
          userId: 'user-1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          displayName: 'Alice',
          role: 'owner',
          joinedAt: now,
        },
        {
          id: 'mem-2',
          userId: 'user-2',
          userName: 'Bob',
          userEmail: 'bob@example.com',
          displayName: 'Bob',
          role: 'member',
          joinedAt: new Date(now.getTime() + 1000),
        },
        {
          id: 'mem-3',
          userId: 'user-3',
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          displayName: 'Charlie',
          role: 'member',
          joinedAt: new Date(now.getTime() + 2000),
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.members?.length).toBe(3);
      expect(result.members?.[0].displayName).toBe('Alice');
      expect(result.members?.[1].displayName).toBe('Bob');
      expect(result.members?.[2].displayName).toBe('Charlie');
    });

    it('DB クエリエラーが発生した場合、エラーメッセージを返すこと', async () => {
      // Mock requireOrganizationAccess to succeed
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'member',
      } as any);

      mockSelectRejectOnce(new Error('Database error'));

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.members).toBeUndefined();
    });

    it('owner が所属組織のメンバー一覧を取得できること', async () => {
      // Mock requireOrganizationAccess to succeed with owner role
      vi.mocked(requireOrganizationAccess).mockResolvedValueOnce({
        ok: true,
        organizationId,
        userId,
        role: 'owner',
      } as any);

      const now = new Date();
      const mockRows = [
        {
          id: 'mem-1',
          userId: 'user-1',
          userName: 'Owner',
          userEmail: 'owner@example.com',
          displayName: 'Owner User',
          role: 'owner',
          joinedAt: now,
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRows);
      const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await getOrganizationMembers({
        headers,
        organizationId,
      });

      expect(result.ok).toBe(true);
      expect(result.members?.length).toBe(1);
      expect(result.members?.[0].role).toBe('owner');
    });
  });
});
