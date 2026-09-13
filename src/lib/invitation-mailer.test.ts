import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendInvitationEmail,
  sendAcceptanceNotificationEmail,
  type SendInvitationEmailParams,
  type SendAcceptanceNotificationParams,
} from './invitation-mailer';

// Mock nodemailer at the top level
const { mockSendMail } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe('Invitation Mailer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendInvitationEmail', () => {
    it('招待メールを正しいパラメータで送信できること（既存ユーザー：ログイン導線）', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-123' });

      const params: SendInvitationEmailParams = {
        toEmail: 'newmember@example.com',
        organizationName: 'Test Organization',
        inviterName: 'John Doe',
        actionLink: 'https://example.com/login?token=token123',
        isExistingUser: true,
      };

      const result = await sendInvitationEmail(params);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledOnce();

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('newmember@example.com');
      expect(callArgs.subject).toContain('Test Organization');
      expect(callArgs.html).toContain('Test Organization');
      expect(callArgs.html).toContain('John Doe');
      expect(callArgs.html).toContain('https://example.com/login?token=token123');
      expect(callArgs.html).toContain('ログインして招待を確認する');
    });

    it('未登録ユーザーの場合、新規登録導線の文言でメールを送信すること', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-789' });

      const params: SendInvitationEmailParams = {
        toEmail: 'newmember@example.com',
        organizationName: 'Test Organization',
        inviterName: 'John Doe',
        actionLink: 'https://example.com/login?mode=signup&token=token123',
        isExistingUser: false,
      };

      const result = await sendInvitationEmail(params);

      expect(result).toBe(true);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('https://example.com/login?mode=signup&token=token123');
      expect(callArgs.html).toContain('新規登録して招待を確認する');
    });

    it('メール送信失敗時は false を返すこと', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const params: SendInvitationEmailParams = {
        toEmail: 'newmember@example.com',
        organizationName: 'Test Organization',
        inviterName: 'John Doe',
        actionLink: 'https://example.com/login?token=token123',
        isExistingUser: true,
      };

      const result = await sendInvitationEmail(params);

      expect(result).toBe(false);
      expect(mockSendMail).toHaveBeenCalledOnce();
    });

    it('メール送信失敗時に例外をスローしないこと', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Connection timeout'));

      const params: SendInvitationEmailParams = {
        toEmail: 'newmember@example.com',
        organizationName: 'Test Organization',
        inviterName: 'John Doe',
        actionLink: 'https://example.com/login?token=token123',
        isExistingUser: true,
      };

      // Should not throw
      await expect(sendInvitationEmail(params)).resolves.toBe(false);
    });

    it('複数パラメータの組み合わせで正しく送信できること', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-456' });

      const params: SendInvitationEmailParams = {
        toEmail: 'alice@company.com',
        organizationName: 'Acme Corp',
        inviterName: 'Bob Smith',
        actionLink: 'https://example.com/login?token=abc123def456',
        isExistingUser: true,
      };

      const result = await sendInvitationEmail(params);

      expect(result).toBe(true);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('alice@company.com');
      expect(callArgs.html).toContain('Acme Corp');
      expect(callArgs.html).toContain('Bob Smith');
      expect(callArgs.html).toContain('https://example.com/login?token=abc123def456');
    });
  });

  describe('sendAcceptanceNotificationEmail', () => {
    it('承諾通知メールを正しいパラメータで送信できること', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'notif-123' });

      const params: SendAcceptanceNotificationParams = {
        toEmail: 'inviter@example.com',
        organizationName: 'Test Organization',
        newMemberName: 'Alice Johnson',
        newMemberEmail: 'alice@example.com',
      };

      const result = await sendAcceptanceNotificationEmail(params);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledOnce();

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('inviter@example.com');
      expect(callArgs.subject).toContain('Test Organization');
      expect(callArgs.html).toContain('Test Organization');
      expect(callArgs.html).toContain('Alice Johnson');
      expect(callArgs.html).toContain('alice@example.com');
    });

    it('メール送信失敗時は false を返すこと', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP server error'));

      const params: SendAcceptanceNotificationParams = {
        toEmail: 'inviter@example.com',
        organizationName: 'Test Organization',
        newMemberName: 'Alice Johnson',
        newMemberEmail: 'alice@example.com',
      };

      const result = await sendAcceptanceNotificationEmail(params);

      expect(result).toBe(false);
      expect(mockSendMail).toHaveBeenCalledOnce();
    });

    it('メール送信失敗時に例外をスローしないこと', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Network error'));

      const params: SendAcceptanceNotificationParams = {
        toEmail: 'inviter@example.com',
        organizationName: 'Test Organization',
        newMemberName: 'Bob Wilson',
        newMemberEmail: 'bob@example.com',
      };

      // Should not throw
      await expect(sendAcceptanceNotificationEmail(params)).resolves.toBe(false);
    });

    it('複数パラメータの組み合わせで正しく送信できること', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'notif-456' });

      const params: SendAcceptanceNotificationParams = {
        toEmail: 'charlie@company.com',
        organizationName: 'Acme Corp',
        newMemberName: 'Diana Prince',
        newMemberEmail: 'diana@company.com',
      };

      const result = await sendAcceptanceNotificationEmail(params);

      expect(result).toBe(true);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('charlie@company.com');
      expect(callArgs.html).toContain('Acme Corp');
      expect(callArgs.html).toContain('Diana Prince');
      expect(callArgs.html).toContain('diana@company.com');
    });
  });
});
