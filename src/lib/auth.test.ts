import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. vi.hoisted() 内でモック関数と設定保持用オブジェクト（refs）をまとめて巻き上げる
const { mockSendMail, refs } = vi.hoisted(() => {
  return {
    mockSendMail: vi.fn(),
    refs: {
      capturedAuthConfig: null as any,
      capturedOtpOptions: null as any,
    },
  };
});

// 2. nodemailer のモック設定
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// 3. better-auth のモック（refs オブジェクトに設定を退避）
vi.mock('better-auth', () => ({
  betterAuth: vi.fn((config) => {
    refs.capturedAuthConfig = config;
    return {
      handler: vi.fn(),
      options: config,
    };
  }),
}));

vi.mock('better-auth/plugins', () => ({
  twoFactor: vi.fn((options) => {
    refs.capturedOtpOptions = options?.otpOptions;
    return { id: 'two-factor' };
  }),
}));

// 依存モジュールのモック（DBアクセスを回避）
vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(),
}));
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({}));

// モック定義完了後にインポート
import '@/lib/auth';

describe('src/lib/auth.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------
  // Test 1: databaseHooks (ユーザー作成時に 2FA フラグを強制付与)
  // -------------------------------------------------------------
  describe('databaseHooks.user.create.before', () => {
    it('新規ユーザー作成時に twoFactorEnabled: true を自動注入すること', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'テスト太郎',
        email: 'test@example.com',
      };

      const result = await refs.capturedAuthConfig.databaseHooks.user.create.before(mockUser);

      expect(result).toEqual({
        data: {
          ...mockUser,
          twoFactorEnabled: true,
        },
      });
    });
  });

  // -------------------------------------------------------------
  // Test 2: emailVerification (新規登録時の確認メール送信)
  // -------------------------------------------------------------
  describe('emailVerification.sendVerificationEmail', () => {
    it('正しい宛先・件名・認証URLを含むメールを nodemailer 経由で送信すること', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-001' });

      const user = { name: 'テスト太郎', email: 'user@example.com' };
      const url = 'http://localhost:3000/api/auth/verify-email?token=xyz123';

      await refs.capturedAuthConfig.emailVerification.sendVerificationEmail({
        user,
        url,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"認証システム" <noreply@example.com>',
          to: 'user@example.com',
          subject: '【メールアドレスの確認】アカウント登録手続き',
          html: expect.stringContaining(url),
        }),
      );
    });

    it('メール送信失敗時にエラーがログ出力され、例外がスローされないこと', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSendMail.mockRejectedValueOnce(new Error('SMTP Connection Failed'));

      const user = { name: 'テスト太郎', email: 'user@example.com' };
      const url = 'http://localhost:3000/api/auth/verify-email?token=xyz123';

      await expect(
        refs.capturedAuthConfig.emailVerification.sendVerificationEmail({
          user,
          url,
        }),
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------
  // Test 4: Canonical URL and Plugins Configuration
  // -------------------------------------------------------------
  describe('canonical URL and plugins options', () => {
    it('baseURL が明示的に設定され、Hostヘッダー等による動的信頼を防止すること', () => {
      expect(refs.capturedAuthConfig.baseURL).toBeDefined();
      expect(typeof refs.capturedAuthConfig.baseURL).toBe('string');
      expect(refs.capturedAuthConfig.baseURL.length).toBeGreaterThan(0);
    });

    it('organization プラグインが含まれていないこと (独自組織基盤を使用するため)', () => {
      const pluginIds = (refs.capturedAuthConfig.plugins || []).map((p: any) => p.id);
      expect(pluginIds).not.toContain('organization');
    });
  });
});
