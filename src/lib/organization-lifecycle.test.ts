import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createOrganization,
  createInvitation,
  validateInvitationToken,
  respondToInvitation,
  processPendingInvitationsForUser,
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
import { organization, membership, invitation, user } from '@/db/schema';
import { sendInvitationEmail, sendAcceptanceNotificationEmail } from '@/lib/invitation-mailer';
import { requireOrganizationAccess } from '@/lib/organization-authz';

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

      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([existingMembership] as any);

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
      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([]);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(existingInvitation as any);

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
        where: vi.fn().mockImplementation((condition: any) => {
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
      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([]);

      // Mock no existing invitation
      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null);

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
      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([]);

      // Mock no existing invitation
      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null);

      // Mock user query to get inviter name
      vi.mocked(db.query.user.findFirst).mockResolvedValueOnce({
        id: userId,
        name: inviterName,
        email: 'inviter@example.com',
        emailVerified: true,
        image: null,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

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
      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

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
      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([]);

      // Mock no existing invitation
      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null);

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
      vi.mocked(db.query.membership.findMany).mockResolvedValueOnce([]);

      // Mock no existing invitation
      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      } as any);

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
      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
      expect(result.invitation).toBeUndefined();
    });

    it('期限切れ招待の場合 expired を返すこと', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day in the past

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
      expect(result.invitation).toBeUndefined();
    });

    it('使用済み招待（accepted）の場合 already-used を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already-used');
      expect(result.invitation).toBeUndefined();
    });

    it('使用済み招待（rejected）の場合 already-used を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      const result = await validateInvitationToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already-used');
      expect(result.invitation).toBeUndefined();
    });

    it('キャンセル済み招待の場合 canceled を返すこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce(null as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      } as any);

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

      vi.mocked(db.query.user.findFirst).mockResolvedValueOnce({
        id: inviterId,
        email: inviterEmail,
        name: 'Inviter Name',
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      } as any);

      const mockUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      vi.mocked(db.update).mockReturnValue({
        set: mockUpdateSet,
      } as any);

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

      vi.mocked(db.query.invitation.findFirst).mockResolvedValueOnce({
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
      } as any);

      vi.mocked(db.query.organization.findFirst).mockResolvedValueOnce({
        id: organizationId,
        name: organizationName,
        slug: 'test-org',
        createdAt: now,
        updatedAt: now,
      } as any);

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

      vi.mocked(db.query.user.findFirst).mockResolvedValueOnce({
        id: inviterId,
        email: inviterEmail,
        name: 'Inviter Name',
      } as any);

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

  // ========================================================================
  // Tests for processPendingInvitationsForUser (Task 4.3)
  // ========================================================================
  describe('processPendingInvitationsForUser', () => {
    const userId = 'new-user-id';
    const email = 'invitee@example.com';
    const organizationId = 'org-123';
    const invitationId = 'inv-123';
    const inviterId = 'inviter-id';
    const organizationName = 'Test Organization';

    it('有効な保留中招待がある場合、membership を作成して招待を accepted に更新すること', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([
        {
          id: invitationId,
          organizationId,
          email,
          token: 'token-123',
          status: 'pending',
          expiresAt: futureDate,
          role: 'member',
          inviterId,
          createdAt: now,
          updatedAt: now,
        },
      ] as any);

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

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('期限切れ招待がある場合、membership を作成しないこと', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1日前

      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([
        {
          id: invitationId,
          organizationId,
          email,
          token: 'token-123',
          status: 'pending',
          expiresAt: pastDate,
          role: 'member',
          inviterId,
          createdAt: now,
          updatedAt: now,
        },
      ] as any);

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('キャンセル済み招待がある場合、membership を作成しないこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      // When querying for pending invitations, canceled invitations won't be returned
      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([]);

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('すでに受け入れ済み招待がある場合、membership を作成しないこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      // When querying for pending invitations, accepted invitations won't be returned
      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([]);

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('拒否済み招待がある場合、membership を作成しないこと', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      // When querying for pending invitations, rejected invitations won't be returned
      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([]);

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('招待が見つからない場合、エラーを出さずに成功すること', async () => {
      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([]);

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('複数の有効な招待がある場合、すべてを処理すること', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const organizationId2 = 'org-456';
      const invitationId2 = 'inv-456';

      vi.mocked(db.query.invitation.findMany).mockResolvedValueOnce([
        {
          id: invitationId,
          organizationId,
          email,
          token: 'token-123',
          status: 'pending',
          expiresAt: futureDate,
          role: 'member',
          inviterId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: invitationId2,
          organizationId: organizationId2,
          email,
          token: 'token-456',
          status: 'pending',
          expiresAt: futureDate,
          role: 'member',
          inviterId,
          createdAt: now,
          updatedAt: now,
        },
      ] as any);

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

      await processPendingInvitationsForUser(userId, email);

      expect(db.query.invitation.findMany).toHaveBeenCalled();
      // Should be called twice (once for each valid invitation)
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });
  });
});
