import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { InvitationAcceptCard, type InvitationDetails } from './invitation-accept-card';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/app/actions/organization', () => ({
  respondToInvitationAction: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { respondToInvitationAction } from '@/app/actions/organization';
import { authClient } from '@/lib/auth-client';

describe('InvitationAcceptCard', () => {
  const invitation: InvitationDetails = {
    id: 'invitation-1',
    organizationId: 'org-1',
    organizationName: 'テスト株式会社',
    email: 'invitee@example.com',
    role: 'member',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('未ログイン時の導線', () => {
    it('既存アカウントの場合、ログインボタンのみ表示すること', () => {
      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={false}
          currentUserEmail={null}
          inviteeHasAccount={true}
        />,
      );

      const loginLink = screen.getByRole('link', { name: 'ログイン' });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink.getAttribute('href')).toContain('/login?email=');
      expect(loginLink.getAttribute('href')).not.toContain('mode=signup');
      expect(loginLink.getAttribute('href')).toContain('token=token-1');
      expect(screen.queryByRole('link', { name: '新規登録' })).not.toBeInTheDocument();
    });

    it('未登録メールアドレスの場合、新規登録ボタンのみ表示すること', () => {
      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={false}
          currentUserEmail={null}
          inviteeHasAccount={false}
        />,
      );

      const signupLink = screen.getByRole('link', { name: '新規登録' });
      expect(signupLink).toBeInTheDocument();
      expect(signupLink.getAttribute('href')).toContain('mode=signup');
      expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument();
    });

    it('招待を受けたメールアドレス以外では参加できない旨のフッター文言を表示すること', () => {
      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={false}
          currentUserEmail={null}
          inviteeHasAccount={true}
        />,
      );

      expect(screen.getByText('招待を受けたメールアドレス以外では、組織に参加できません。')).toBeInTheDocument();
    });
  });

  describe('アカウント不一致時の導線', () => {
    it('招待メールアドレスと現在ログイン中のメールアドレスを表示しないこと', () => {
      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail="other@example.com"
          inviteeHasAccount={true}
        />,
      );

      expect(screen.queryByText(invitation.email)).not.toBeInTheDocument();
      expect(screen.queryByText('other@example.com')).not.toBeInTheDocument();
    });

    it('再ログインボタンが1つだけ表示されること', () => {
      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail="other@example.com"
          inviteeHasAccount={true}
        />,
      );

      expect(screen.getByRole('button', { name: '再ログイン' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ログアウト' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument();
    });

    it('再ログインボタン押下でサインアウト後、招待先メールアドレスのログイン画面へ遷移すること', async () => {
      vi.mocked(authClient.signOut).mockImplementation(async (opts) => {
        (opts as { fetchOptions?: { onSuccess?: (ctx: unknown) => void } })?.fetchOptions?.onSuccess?.({});
        return {} as never;
      });

      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail="other@example.com"
          inviteeHasAccount={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringMatching(/^\/login\?email=invitee%40example\.com&token=token-1$/),
        );
      });
    });

    it('招待先メールアドレスが未登録の場合、再ログインボタンで新規登録画面へ遷移すること', async () => {
      vi.mocked(authClient.signOut).mockImplementation(async (opts) => {
        (opts as { fetchOptions?: { onSuccess?: (ctx: unknown) => void } })?.fetchOptions?.onSuccess?.({});
        return {} as never;
      });

      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail="other@example.com"
          inviteeHasAccount={false}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '再ログイン' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('mode=signup'));
      });
    });
  });

  describe('招待の承諾・拒否（ログイン済み・メール一致時）', () => {
    it('承諾ボタン押下で respondToInvitationAction が accept=true で呼ばれること', async () => {
      vi.mocked(respondToInvitationAction).mockResolvedValueOnce({ ok: true });

      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail={invitation.email}
          inviteeHasAccount={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '承諾する' }));

      await waitFor(() => {
        expect(respondToInvitationAction).toHaveBeenCalledWith('token-1', true);
      });
    });

    it('承諾完了後に /dashboard/personal へ遷移すること', async () => {
      vi.useFakeTimers();
      vi.mocked(respondToInvitationAction).mockResolvedValueOnce({ ok: true });

      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail={invitation.email}
          inviteeHasAccount={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '承諾する' }));

      await Promise.resolve();
      expect(respondToInvitationAction).toHaveBeenCalledWith('token-1', true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/personal');
    });

    it('拒否完了後の戻り先リンクが /dashboard/personal を指すこと', async () => {
      vi.mocked(respondToInvitationAction).mockResolvedValueOnce({ ok: true });

      render(
        <InvitationAcceptCard
          token="token-1"
          invitation={invitation}
          isLoggedIn={true}
          currentUserEmail={invitation.email}
          inviteeHasAccount={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '拒否する' }));

      const dashboardLink = await screen.findByRole('link', { name: 'ダッシュボードに戻る' });
      expect(dashboardLink).toHaveAttribute('href', '/dashboard/personal');
    });
  });
});
