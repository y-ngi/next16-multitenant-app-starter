import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberMutationResult, ViewableMember } from '@/lib/organization-member-management';
import { MemberList } from './member-list';

const { mockRefresh, mockConfirm, mockToastError } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockConfirm: vi.fn<(message?: string) => boolean>(),
  mockToastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

describe('MemberList', () => {
  const createMember = (overrides: Partial<ViewableMember>): ViewableMember => ({
    id: overrides.id ?? 'membership-1',
    userId: overrides.userId ?? 'user-1',
    userName: overrides.userName ?? 'user-1',
    userEmail: overrides.userEmail,
    displayName: overrides.displayName ?? null,
    role: overrides.role ?? 'member',
    joinedAt: overrides.joinedAt ?? new Date('2024-01-01T00:00:00.000Z'),
  });

  const members = [
    createMember({
      id: 'membership-owner-self',
      userId: 'viewer-1',
      userName: 'owner-self',
      userEmail: 'owner-self@example.com',
      displayName: '自分',
      role: 'owner',
      joinedAt: new Date('2024-01-01T00:00:00.000Z'),
    }),
    createMember({
      id: 'membership-member-1',
      userId: 'member-1',
      userName: 'member-user',
      userEmail: 'member-1@example.com',
      displayName: '一般メンバー',
      role: 'member',
      joinedAt: new Date('2024-01-02T00:00:00.000Z'),
    }),
    createMember({
      id: 'membership-owner-2',
      userId: 'owner-2',
      userName: 'owner-user',
      userEmail: 'owner-2@example.com',
      displayName: '別のオーナー',
      role: 'owner',
      joinedAt: new Date('2024-01-03T00:00:00.000Z'),
    }),
  ] as const satisfies readonly ViewableMember[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', mockConfirm);
    mockConfirm.mockReturnValue(true);
  });

  it('owner 視点ではメール付きの行と他メンバー向け操作ボタンを表示すること', () => {
    render(
      <MemberList
        members={members}
        viewerRole="owner"
        viewerUserId="viewer-1"
        onRemoveMember={vi.fn()}
        onChangeRole={vi.fn()}
      />
    );

    expect(screen.getByText('owner-self@example.com')).toBeInTheDocument();
    expect(screen.getByText('member-1@example.com')).toBeInTheDocument();
    expect(screen.getByText('owner-2@example.com')).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'owner に変更' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'member に変更' })).toBeInTheDocument();
  });

  it('owner 視点でも自分の行には操作ボタンを表示しないこと', () => {
    render(
      <MemberList
        members={members}
        viewerRole="owner"
        viewerUserId="viewer-1"
        onRemoveMember={vi.fn()}
        onChangeRole={vi.fn()}
      />
    );

    const ownCard = screen.getByText('自分').closest('[data-slot="card"]');
    expect(ownCard).not.toBeNull();
    expect(within(ownCard as HTMLElement).queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(
      within(ownCard as HTMLElement).queryByRole('button', { name: 'owner に変更' })
    ).not.toBeInTheDocument();
    expect(
      within(ownCard as HTMLElement).queryByRole('button', { name: 'member に変更' })
    ).not.toBeInTheDocument();
  });

  it('member 視点ではメールと操作ボタンを表示しないこと', () => {
    const memberViewMembers = [
      createMember({
        id: 'membership-owner-self',
        userId: 'viewer-1',
        userName: 'owner-self',
        displayName: '自分',
        role: 'member',
      }),
      createMember({
        id: 'membership-member-1',
        userId: 'member-1',
        userName: 'member-user',
        displayName: '別メンバー',
        role: 'owner',
      }),
    ] as const satisfies readonly ViewableMember[];

    render(
      <MemberList
        members={memberViewMembers}
        viewerRole="member"
        viewerUserId="viewer-1"
        onRemoveMember={vi.fn()}
        onChangeRole={vi.fn()}
      />
    );

    expect(screen.queryByText('owner-self@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('member-1@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'owner に変更' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'member に変更' })).not.toBeInTheDocument();
  });

  it('削除とロール変更の成功時に props の操作関数を呼び router.refresh すること', async () => {
    const removeResult: MemberMutationResult = { ok: true, members };
    const changeRoleResult: MemberMutationResult = { ok: true, members };
    const onRemoveMember = vi.fn().mockResolvedValue(removeResult);
    const onChangeRole = vi.fn().mockResolvedValue(changeRoleResult);

    render(
      <MemberList
        members={members}
        viewerRole="owner"
        viewerUserId="viewer-1"
        onRemoveMember={onRemoveMember}
        onChangeRole={onChangeRole}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(onRemoveMember).toHaveBeenCalledWith('member-1');
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'owner に変更' }));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledTimes(2);
      expect(onChangeRole).toHaveBeenCalledWith('member-1', 'owner');
      expect(mockRefresh).toHaveBeenCalledTimes(2);
    });
  });

  it('メンバーが空なら空状態を表示すること', () => {
    render(
      <MemberList
        members={[]}
        viewerRole="owner"
        viewerUserId="viewer-1"
        onRemoveMember={vi.fn()}
        onChangeRole={vi.fn()}
      />
    );

    expect(screen.getByText('メンバーがいません。メンバーを招待してください。')).toBeInTheDocument();
  });
});
