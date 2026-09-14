import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  DeleteOrganizationResult,
  MemberMutationResult,
} from '@/lib/organization-member-management';
import { OrganizationDangerZone } from './organization-danger-zone';

const { pushMock, refreshMock, confirmMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  confirmMock: vi.fn<(message?: string) => boolean>(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function renderOrganizationDangerZone(
  props: Partial<ComponentProps<typeof OrganizationDangerZone>> = {}
) {
  const onChangeOwnRole =
    props.onChangeOwnRole ??
    vi.fn<
      (
        organizationSlug: string,
        userId: string,
        newRole: 'member'
      ) => Promise<MemberMutationResult>
    >().mockResolvedValue({
      ok: true,
      members: [],
    });
  const onDeleteOrganization =
    props.onDeleteOrganization ??
    vi.fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>().mockResolvedValue({
      ok: true,
    });

  return {
    onChangeOwnRole,
    onDeleteOrganization,
    ...render(
      <OrganizationDangerZone
        organizationSlug="acme"
        currentUserId="user-1"
        onChangeOwnRole={onChangeOwnRole}
        onDeleteOrganization={onDeleteOrganization}
        {...props}
      />
    ),
  };
}

describe('OrganizationDangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', confirmMock);
    confirmMock.mockReturnValue(true);
  });

  it('自己降格ボタンと組織削除ボタンを表示すること', () => {
    renderOrganizationDangerZone();

    expect(screen.getByRole('button', { name: '自分をmemberに変更' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '組織を削除' })).toBeInTheDocument();
  });

  it('自己降格の確認後に正しい引数で onChangeOwnRole を呼び router.refresh すること', async () => {
    const onChangeOwnRole = vi
      .fn<
        (
          organizationSlug: string,
          userId: string,
          newRole: 'member'
        ) => Promise<MemberMutationResult>
      >()
      .mockResolvedValue({
        ok: true,
        members: [],
      });

    renderOrganizationDangerZone({ onChangeOwnRole });

    fireEvent.click(screen.getByRole('button', { name: '自分をmemberに変更' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(onChangeOwnRole).toHaveBeenCalledWith('acme', 'user-1', 'member');
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(toastSuccessMock).toHaveBeenCalledWith('自分のロールを member に変更しました');
    });
  });

  it('自己降格が last-owner-protection で失敗した場合は指定メッセージを表示すること', async () => {
    const onChangeOwnRole = vi
      .fn<
        (
          organizationSlug: string,
          userId: string,
          newRole: 'member'
        ) => Promise<MemberMutationResult>
      >()
      .mockResolvedValue({
        ok: false,
        reason: 'last-owner-protection',
      });

    renderOrganizationDangerZone({ onChangeOwnRole });

    fireEvent.click(screen.getByRole('button', { name: '自分をmemberに変更' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        '少なくとも1人の owner が必要です。別のメンバーを owner に変更してください'
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('組織削除の確認後に organizationSlug を使って onDeleteOrganization を呼ぶこと', async () => {
    const onDeleteOrganization = vi
      .fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>()
      .mockResolvedValue({
        ok: true,
      });

    renderOrganizationDangerZone({ onDeleteOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織を削除' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(onDeleteOrganization).toHaveBeenCalledWith('acme');
    });
  });

  it('組織削除成功時に個人の組織一覧へ遷移すること', async () => {
    renderOrganizationDangerZone();

    fireEvent.click(screen.getByRole('button', { name: '組織を削除' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/personal/organizations');
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('組織削除失敗時は指定メッセージを表示し遷移しないこと', async () => {
    const onDeleteOrganization = vi
      .fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>()
      .mockResolvedValue({
        ok: false,
        reason: 'not-found',
      });

    renderOrganizationDangerZone({ onDeleteOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織を削除' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('削除できませんでした。もう一度お試しください');
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('自己降格の確認をキャンセルした場合は自己降格も組織削除も実行しないこと', () => {
    confirmMock.mockReturnValue(false);
    const onChangeOwnRole = vi.fn<
      (
        organizationSlug: string,
        userId: string,
        newRole: 'member'
      ) => Promise<MemberMutationResult>
    >();
    const onDeleteOrganization = vi.fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>();

    renderOrganizationDangerZone({ onChangeOwnRole, onDeleteOrganization });

    fireEvent.click(screen.getByRole('button', { name: '自分をmemberに変更' }));

    expect(onChangeOwnRole).not.toHaveBeenCalled();
    expect(onDeleteOrganization).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('組織削除の確認をキャンセルした場合は組織削除も自己降格も実行しないこと', () => {
    confirmMock.mockReturnValue(false);
    const onChangeOwnRole = vi.fn<
      (
        organizationSlug: string,
        userId: string,
        newRole: 'member'
      ) => Promise<MemberMutationResult>
    >();
    const onDeleteOrganization = vi.fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>();

    renderOrganizationDangerZone({ onChangeOwnRole, onDeleteOrganization });

    fireEvent.click(screen.getByRole('button', { name: '組織を削除' }));

    expect(onDeleteOrganization).not.toHaveBeenCalled();
    expect(onChangeOwnRole).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('2つの操作が独立しており片方のキャンセル後でももう片方を実行できること', async () => {
    const onChangeOwnRole = vi
      .fn<
        (
          organizationSlug: string,
          userId: string,
          newRole: 'member'
        ) => Promise<MemberMutationResult>
      >()
      .mockResolvedValue({
        ok: true,
        members: [],
      });
    const onDeleteOrganization = vi
      .fn<(organizationSlug: string) => Promise<DeleteOrganizationResult>>()
      .mockResolvedValue({
        ok: true,
      });

    confirmMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderOrganizationDangerZone({ onChangeOwnRole, onDeleteOrganization });

    fireEvent.click(screen.getByRole('button', { name: '自分をmemberに変更' }));
    fireEvent.click(screen.getByRole('button', { name: '組織を削除' }));

    expect(onChangeOwnRole).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(2);
      expect(onDeleteOrganization).toHaveBeenCalledWith('acme');
      expect(pushMock).toHaveBeenCalledWith('/dashboard/personal/organizations');
    });
  });
});
