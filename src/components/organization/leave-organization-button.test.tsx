import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LeaveOrganizationResult } from '@/lib/organization-member-management';
import { LeaveOrganizationButton } from './leave-organization-button';

const { pushMock, confirmMock, toastErrorMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  confirmMock: vi.fn<(message?: string) => boolean>(),
  toastErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

function renderLeaveOrganizationButton(
  props: Partial<ComponentProps<typeof LeaveOrganizationButton>> = {}
) {
  const onLeaveOrganization =
    props.onLeaveOrganization ??
    vi.fn<(organizationSlug: string) => Promise<LeaveOrganizationResult>>().mockResolvedValue({
      ok: true,
    });

  return {
    onLeaveOrganization,
    ...render(
      <LeaveOrganizationButton
        organizationSlug="acme"
        onLeaveOrganization={onLeaveOrganization}
        {...props}
      />
    ),
  };
}

describe('LeaveOrganizationButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', confirmMock);
    confirmMock.mockReturnValue(true);
  });

  it('脱退ボタンを表示すること', () => {
    renderLeaveOrganizationButton();

    expect(screen.getByRole('button', { name: '組織から脱退する' })).toBeInTheDocument();
  });

  it('確認後に organizationSlug を使って脱退処理を実行すること', async () => {
    const onLeaveOrganization = vi
      .fn<(organizationSlug: string) => Promise<LeaveOrganizationResult>>()
      .mockResolvedValue({ ok: true });

    renderLeaveOrganizationButton({ onLeaveOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織から脱退する' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(onLeaveOrganization).toHaveBeenCalledWith('acme');
    });
  });

  it('成功時に個人の組織一覧へ遷移すること', async () => {
    renderLeaveOrganizationButton();

    fireEvent.click(screen.getByRole('button', { name: '組織から脱退する' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/personal/organizations');
    });
  });

  it('last-owner-protection 失敗時は指定メッセージを表示して遷移しないこと', async () => {
    const onLeaveOrganization = vi
      .fn<(organizationSlug: string) => Promise<LeaveOrganizationResult>>()
      .mockResolvedValue({ ok: false, reason: 'last-owner-protection' });

    renderLeaveOrganizationButton({ onLeaveOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織から脱退する' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        '別のメンバーを owner に変更する必要があります'
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('認可エラー時は権限メッセージを表示して遷移しないこと', async () => {
    const onLeaveOrganization = vi
      .fn<(organizationSlug: string) => Promise<LeaveOrganizationResult>>()
      .mockResolvedValue({ ok: false, reason: 'unauthenticated' });

    renderLeaveOrganizationButton({ onLeaveOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織から脱退する' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('権限がありません');
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('確認をキャンセルした場合は脱退処理も遷移も行わないこと', () => {
    confirmMock.mockReturnValue(false);
    const onLeaveOrganization = vi.fn<(organizationSlug: string) => Promise<LeaveOrganizationResult>>();

    renderLeaveOrganizationButton({ onLeaveOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織から脱退する' }));

    expect(onLeaveOrganization).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
