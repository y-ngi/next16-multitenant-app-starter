import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from './page';

// Mock validateInvitationToken
const mockValidateToken = vi.fn();
vi.mock('@/lib/organization-lifecycle', () => ({
  validateInvitationToken: (token: string) => mockValidateToken(token),
}));

// Mock AuthForm component to inspect props
vi.mock('@/components/auth-form', () => ({
  AuthForm: (props: any) => (
    <div data-testid="auth-form-mock" data-props={JSON.stringify(props)}>
      <span data-testid="default-email">{props.defaultEmail || ''}</span>
      <span data-testid="email-locked">{String(props.isEmailLocked)}</span>
      <span data-testid="is-signup">{String(props.defaultIsSignUp)}</span>
      <span data-testid="callback-url">{props.callbackURL || ''}</span>
    </div>
  ),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有効なトークンと mode=signup の場合、メール固定かつ新規登録モードで AuthForm を描画すること', async () => {
    mockValidateToken.mockResolvedValueOnce({
      valid: true,
      invitation: {
        id: 'inv-1',
        email: 'verified-invitee@example.com',
      },
    });

    const page = await LoginPage({
      searchParams: Promise.resolve({
        token: 'valid-token-123',
        mode: 'signup',
      }),
    });

    render(page);

    expect(screen.getByTestId('default-email').textContent).toBe('verified-invitee@example.com');
    expect(screen.getByTestId('email-locked').textContent).toBe('true');
    expect(screen.getByTestId('is-signup').textContent).toBe('true');
    expect(screen.getByTestId('callback-url').textContent).toBe('/invitations/accept?token=valid-token-123');
  });

  it('有効なトークンで mode 指定なし（ログイン導線）の場合、メール未固定かつログインモードで AuthForm を描画すること', async () => {
    mockValidateToken.mockResolvedValueOnce({
      valid: true,
      invitation: {
        id: 'inv-1',
        email: 'verified-invitee@example.com',
      },
    });

    const page = await LoginPage({
      searchParams: Promise.resolve({
        token: 'valid-token-123',
      }),
    });

    render(page);

    expect(screen.getByTestId('default-email').textContent).toBe('verified-invitee@example.com');
    expect(screen.getByTestId('email-locked').textContent).toBe('false');
    expect(screen.getByTestId('is-signup').textContent).toBe('false');
    expect(screen.getByTestId('callback-url').textContent).toBe('/invitations/accept?token=valid-token-123');
  });

  it('トークンなしで通常アクセスした場合、デフォルト設定で AuthForm を描画すること', async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(screen.getByTestId('default-email').textContent).toBe('');
    expect(screen.getByTestId('email-locked').textContent).toBe('false');
    expect(screen.getByTestId('is-signup').textContent).toBe('false');
    expect(screen.getByTestId('callback-url').textContent).toBe('');
  });
});
