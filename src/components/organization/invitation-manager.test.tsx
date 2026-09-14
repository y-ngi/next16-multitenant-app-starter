import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CancelInvitationResult } from '@/lib/organization-member-management';
import { InvitationManager, type InvitationRecord } from './invitation-manager';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('@/app/actions/organization', () => ({
  createInvitationAction: vi.fn(),
  getInvitationsAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import { createInvitationAction, getInvitationsAction } from '@/app/actions/organization';
import { toast } from 'sonner';

const mockOrganizationId = 'org-1';
const baseInvitations: readonly InvitationRecord[] = [
  {
    id: 'inv-pending',
    email: 'pending@example.com',
    role: 'member',
    status: 'pending',
    inviteLink: 'https://example.test/invitations/accept?token=pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-12-31T00:00:00Z'),
  },
  {
    id: 'inv-canceled',
    email: 'canceled@example.com',
    role: 'member',
    status: 'canceled',
    inviteLink: 'https://example.test/invitations/accept?token=canceled',
    createdAt: new Date('2024-01-02T00:00:00Z'),
    expiresAt: new Date('2024-12-31T00:00:00Z'),
  },
];

function renderInvitationManager(
  props: Partial<ComponentProps<typeof InvitationManager>> = {}
) {
  const onCancelInvitation =
    props.onCancelInvitation ??
    (vi.fn<
      (invitationId: string) => Promise<CancelInvitationResult>
    >().mockResolvedValue({ ok: true }));

  return {
    onCancelInvitation,
    ...render(
      <InvitationManager
        organizationId={mockOrganizationId}
        invitations={baseInvitations}
        onCancelInvitation={onCancelInvitation}
        {...props}
      />
    ),
  };
}

describe('InvitationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('props で受け取った招待一覧をそのまま表示し、マウント時に一覧取得しないこと', () => {
    renderInvitationManager();

    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('canceled@example.com')).toBeInTheDocument();
    expect(vi.mocked(getInvitationsAction)).not.toHaveBeenCalled();
  });

  it('pending 状態の招待にのみキャンセルボタンを表示すること', () => {
    renderInvitationManager();

    const cancelButtons = screen.getAllByRole('button', { name: '招待を取り消す' });
    expect(cancelButtons).toHaveLength(1);
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('canceled')).toBeInTheDocument();
  });

  it('onCancelInvitation が未指定の read-only モードではキャンセルボタンを表示しないこと', () => {
    render(
      <InvitationManager
        organizationId={mockOrganizationId}
        invitations={baseInvitations}
      />
    );

    expect(screen.queryByRole('button', { name: '招待を取り消す' })).not.toBeInTheDocument();
  });

  it('キャンセル成功時に onCancelInvitation を呼び出して router.refresh すること', async () => {
    const onCancelInvitation = vi
      .fn<(invitationId: string) => Promise<CancelInvitationResult>>()
      .mockResolvedValue({ ok: true });

    renderInvitationManager({ onCancelInvitation });

    fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }));

    await waitFor(() => {
      expect(onCancelInvitation).toHaveBeenCalledWith('inv-pending');
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('キャンセル失敗時にエラートーストを表示し一覧を維持すること', async () => {
    const onCancelInvitation = vi
      .fn<(invitationId: string) => Promise<CancelInvitationResult>>()
      .mockResolvedValue({ ok: false, reason: 'invitation-not-pending' });

    renderInvitationManager({ onCancelInvitation });

    fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        '対象の招待は既に処理済みか存在しません'
      );
    });
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
  });

  it('状態エラーでキャンセル失敗した場合も最新化のため router.refresh すること', async () => {
    const onCancelInvitation = vi
      .fn<(invitationId: string) => Promise<CancelInvitationResult>>()
      .mockResolvedValue({ ok: false, reason: 'not-found' });

    renderInvitationManager({ onCancelInvitation });

    fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        '対象の招待は既に処理済みか存在しません'
      );
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('権限エラーでキャンセル失敗した場合は権限トーストを表示すること', async () => {
    const onCancelInvitation = vi
      .fn<(invitationId: string) => Promise<CancelInvitationResult>>()
      .mockResolvedValue({ ok: false, reason: 'insufficient-role' });

    renderInvitationManager({ onCancelInvitation });

    fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('権限がありません');
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('招待作成フォーム成功時に createInvitationAction を呼び出して router.refresh すること', async () => {
    const onInvitationCreated = vi.fn();

    vi.mocked(createInvitationAction).mockResolvedValueOnce({
      ok: true,
      invitation: {
        id: 'inv-new',
        email: 'newuser@example.com',
        status: 'pending',
        token: 'token-new',
        inviteLink: 'https://example.test/invitations/accept?token=new',
        expiresAt: new Date('2024-12-31T00:00:00Z'),
        createdAt: new Date('2024-01-03T00:00:00Z'),
      },
      mailSent: true,
    });

    renderInvitationManager({ onInvitationCreated });

    fireEvent.change(screen.getByPlaceholderText('メールアドレスを入力'), {
      target: { value: '  newuser@example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => {
      expect(createInvitationAction).toHaveBeenCalledWith(mockOrganizationId, 'newuser@example.com');
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('招待を送信しました');
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(onInvitationCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('onInvitationCreated が未指定でも招待作成成功時にクラッシュせず router.refresh すること', async () => {
    vi.mocked(createInvitationAction).mockResolvedValueOnce({
      ok: true,
      invitation: {
        id: 'inv-new',
        email: 'nocallback@example.com',
        status: 'pending',
        token: 'token-nocallback',
        inviteLink: 'https://example.test/invitations/accept?token=nocallback',
        expiresAt: new Date('2024-12-31T00:00:00Z'),
        createdAt: new Date('2024-01-05T00:00:00Z'),
      },
      mailSent: true,
    });

    renderInvitationManager();

    fireEvent.change(screen.getByPlaceholderText('メールアドレスを入力'), {
      target: { value: 'nocallback@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => {
      expect(createInvitationAction).toHaveBeenCalledWith(
        mockOrganizationId,
        'nocallback@example.com'
      );
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('招待を送信しました');
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('招待作成成功時にメール送信失敗なら警告トーストを表示すること', async () => {
    vi.mocked(createInvitationAction).mockResolvedValueOnce({
      ok: true,
      invitation: {
        id: 'inv-new',
        email: 'warning@example.com',
        status: 'pending',
        token: 'token-warning',
        inviteLink: 'https://example.test/invitations/accept?token=warning',
        expiresAt: new Date('2024-12-31T00:00:00Z'),
        createdAt: new Date('2024-01-04T00:00:00Z'),
      },
      mailSent: false,
    });

    renderInvitationManager();

    fireEvent.change(screen.getByPlaceholderText('メールアドレスを入力'), {
      target: { value: 'warning@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => {
      expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
        'メール送信に失敗しました。招待リンクを手動で共有してください'
      );
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('保留中招待のリンクコピーを維持すること', async () => {
    renderInvitationManager();

    fireEvent.click(screen.getByRole('button', { name: 'リンクをコピー' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://example.test/invitations/accept?token=pending'
      );
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('招待リンクをコピーしました');
    });
  });
});
