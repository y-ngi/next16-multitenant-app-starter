import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrganizationList } from './organization-list';
import type { InvitationRecord } from './invitation-manager';

const memberListMock = vi.hoisted(() =>
  vi.fn(
    ({
      members,
      viewerRole,
    }: {
      members: ReadonlyArray<{
        readonly id: string;
        readonly userId: string;
        readonly userName: string;
        readonly userEmail?: string;
        readonly displayName?: string | null;
        readonly role: string;
        readonly joinedAt: Date;
      }>;
      viewerRole: string;
    }) => (
      <div
        data-testid="member-list-props"
        data-viewer-role={viewerRole}
        data-members={JSON.stringify(
          members.map((member) => ({
            id: member.id,
            userId: member.userId,
            userName: member.userName,
            displayName: member.displayName ?? null,
            role: member.role,
            joinedAt:
              member.joinedAt instanceof Date
                ? member.joinedAt.toISOString()
                : String(member.joinedAt),
            hasUserEmail: Object.prototype.hasOwnProperty.call(member, 'userEmail'),
            userEmail: member.userEmail ?? null,
          }))
        )}
      >
        {members.map((member) => (
          <div key={member.id}>
            <span>{member.displayName || member.userName}</span>
            {member.userEmail ? <span>{member.userEmail}</span> : null}
          </div>
        ))}
      </div>
    )
  )
);

const invitationManagerMock = vi.hoisted(() =>
  vi.fn(
    ({
      organizationId,
      invitations,
      onCancelInvitation,
      onInvitationCreated,
    }: {
      organizationId: string;
      invitations: readonly InvitationRecord[];
      onCancelInvitation?: (invitationId: string) => Promise<{ readonly ok: boolean }>;
      onInvitationCreated?: () => void;
    }) => (
      <div
        data-testid={`invitation-manager-${organizationId}`}
        data-invitation-count={String(invitations.length)}
        data-has-cancel={onCancelInvitation ? 'yes' : 'no'}
        data-has-created-callback={onInvitationCreated ? 'yes' : 'no'}
      >
        {invitations.map((invitation) => invitation.email).join(',')}
        {onInvitationCreated ? (
          <button type="button" onClick={() => onInvitationCreated()}>
            作成成功を通知
          </button>
        ) : null}
      </div>
    )
  )
);

vi.mock('@/app/actions/organization', () => ({
  getUserOrganizationsAction: vi.fn(),
  getOrganizationMembersAction: vi.fn(),
  getInvitationsAction: vi.fn(),
}));

vi.mock('@/app/actions/organization-member-management', () => ({
  listMembersForViewerAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('./invitation-manager', () => ({
  InvitationManager: invitationManagerMock,
}));

vi.mock('./member-list', () => ({
  MemberList: memberListMock,
}));

import {
  getInvitationsAction,
  getOrganizationMembersAction,
  getUserOrganizationsAction,
} from '@/app/actions/organization';
import { listMembersForViewerAction } from '@/app/actions/organization-member-management';

describe('OrganizationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitationManagerMock.mockClear();
    memberListMock.mockClear();
    vi.mocked(getOrganizationMembersAction).mockReset();
    vi.mocked(getInvitationsAction).mockReset();
    vi.mocked(listMembersForViewerAction).mockReset();
  });

  it('読み込み中はスケルトンを表示すること', () => {
    vi.mocked(getUserOrganizationsAction).mockImplementationOnce(() => new Promise(() => {}));

    const { container } = render(<OrganizationList />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('組織一覧を表示すること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org 1',
        slug: 'test-org-1',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'org-2',
        name: 'Test Org 2',
        slug: 'test-org-2',
        role: 'member' as const,
        joinedAt: new Date('2024-01-02'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText('Test Org 1')).toBeInTheDocument();
      expect(screen.getByText('Test Org 2')).toBeInTheDocument();
    });
  });

  it('各組織カードに組織コンテキストを開くリンクを表示すること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org 1',
        slug: 'test-org-1',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'org-2',
        name: 'Test Org 2',
        slug: 'test-org-2',
        role: 'member' as const,
        joinedAt: new Date('2024-01-02'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      const openLinks = screen.getAllByRole('link', { name: '組織を開く' });
      expect(openLinks).toHaveLength(2);
      expect(openLinks[0]).toHaveAttribute('href', '/dashboard/org/test-org-1');
      expect(openLinks[1]).toHaveAttribute('href', '/dashboard/org/test-org-2');
    });
  });

  it('ロールバッジを表示すること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText('オーナー')).toBeInTheDocument();
    });
  });

  it('組織がない場合にメッセージを表示すること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText(/所属している組織がありません/)).toBeInTheDocument();
      expect(screen.getByText(/新しい組織を作成/)).toBeInTheDocument();
      expect(screen.getByText(/招待をお待ちください/)).toBeInTheDocument();
    });
  });

  it('エラーが発生した場合にエラーメッセージを表示すること', async () => {
    const errorMessage = '組織の取得に失敗しました';

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: false,
      error: errorMessage,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('refreshKey が変更されると再度データを取得すること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date(),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValue({
      ok: true,
      organizations: mockOrganizations,
    });

    const { rerender } = render(<OrganizationList refreshKey={0} />);

    await waitFor(() => {
      expect(getUserOrganizationsAction).toHaveBeenCalledTimes(1);
    });

    rerender(<OrganizationList refreshKey={1} />);

    await waitFor(() => {
      expect(getUserOrganizationsAction).toHaveBeenCalledTimes(2);
    });
  });

  it('参加日を日本語形式で表示すること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-15'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText(/に参加/)).toBeInTheDocument();
    });
  });

  it('member 権限の閲覧者がメンバー一覧を開くと role-aware action を使い email なしデータだけを保持すること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'member' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });
    vi.mocked(listMembersForViewerAction).mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'member',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'member-user',
          displayName: '表示メンバー',
          role: 'member',
          joinedAt: new Date('2024-01-03'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    expect(listMembersForViewerAction).not.toHaveBeenCalled();
    expect(getOrganizationMembersAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('member-list-toggle-org-1'));

    await waitFor(() => {
      expect(listMembersForViewerAction).toHaveBeenCalledWith('test-org');
      expect(getOrganizationMembersAction).not.toHaveBeenCalled();
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
      expect(screen.getByText('表示メンバー')).toBeInTheDocument();
    });

    expect(screen.getByTestId('member-list-props')).toHaveAttribute('data-viewer-role', 'member');
    expect(screen.getByTestId('member-list-props')).toHaveAttribute(
      'data-members',
      JSON.stringify([
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'member-user',
          displayName: '表示メンバー',
          role: 'member',
          joinedAt: '2024-01-03T00:00:00.000Z',
          hasUserEmail: false,
          userEmail: null,
        },
      ])
    );
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
  });

  it('メンバー一覧ボタンをもう一度クリックするとメンバーリストが閉じること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });
    vi.mocked(listMembersForViewerAction).mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'owner',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'member-user',
          userEmail: 'member@example.com',
          displayName: '表示メンバー',
          role: 'member',
          joinedAt: new Date('2024-01-03'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    const memberListButton = screen.getByTestId('member-list-toggle-org-1');

    fireEvent.click(memberListButton);
    await waitFor(() => {
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
    });

    fireEvent.click(memberListButton);
    await waitFor(() => {
      expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();
    });
  });

  it('オーナー権限で招待管理ボタンが表示されること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-toggle-org-1')).toBeInTheDocument();
    });
  });

  it('メンバー権限で招待管理ボタンが表示されないこと', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'member' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.queryByTestId('invitation-toggle-org-1')).not.toBeInTheDocument();
    });
  });

  it('招待管理を開くと一覧を取得し read-only props で InvitationManager に渡すこと', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });
    vi.mocked(getInvitationsAction).mockResolvedValueOnce({
      ok: true,
      invitations: [
        {
          id: 'inv-1',
          email: 'pending@example.com',
          role: 'member',
          status: 'pending',
          inviteLink: 'https://example.test/invitations/accept?token=1',
          createdAt: new Date('2024-01-03T00:00:00Z'),
          expiresAt: new Date('2024-12-31T00:00:00Z'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-toggle-org-1')).toBeInTheDocument();
    });

    expect(getInvitationsAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('invitation-toggle-org-1'));

    await waitFor(() => {
      expect(getInvitationsAction).toHaveBeenCalledWith('org-1');
      expect(screen.getByTestId('invitation-manager-org-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('invitation-manager-org-1')).toHaveAttribute('data-invitation-count', '1');
    expect(screen.getByTestId('invitation-manager-org-1')).toHaveAttribute('data-has-cancel', 'no');
    expect(screen.getByTestId('invitation-manager-org-1')).toHaveAttribute(
      'data-has-created-callback',
      'yes'
    );
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
  });

  it('InvitationManager から招待作成成功が通知されると一覧を再取得すること', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });
    vi.mocked(getInvitationsAction)
      .mockResolvedValueOnce({
        ok: true,
        invitations: [
          {
            id: 'inv-1',
            email: 'pending@example.com',
            role: 'member',
            status: 'pending',
            inviteLink: 'https://example.test/invitations/accept?token=1',
            createdAt: new Date('2024-01-03T00:00:00Z'),
            expiresAt: new Date('2024-12-31T00:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        invitations: [
          {
            id: 'inv-1',
            email: 'pending@example.com',
            role: 'member',
            status: 'pending',
            inviteLink: 'https://example.test/invitations/accept?token=1',
            createdAt: new Date('2024-01-03T00:00:00Z'),
            expiresAt: new Date('2024-12-31T00:00:00Z'),
          },
          {
            id: 'inv-2',
            email: 'new@example.com',
            role: 'member',
            status: 'pending',
            inviteLink: 'https://example.test/invitations/accept?token=2',
            createdAt: new Date('2024-01-04T00:00:00Z'),
            expiresAt: new Date('2024-12-31T00:00:00Z'),
          },
        ],
      });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-toggle-org-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('invitation-toggle-org-1'));

    await waitFor(() => {
      expect(getInvitationsAction).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('invitation-manager-org-1')).toHaveAttribute(
        'data-invitation-count',
        '1'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '作成成功を通知' }));

    await waitFor(() => {
      expect(getInvitationsAction).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('invitation-manager-org-1')).toHaveAttribute(
        'data-invitation-count',
        '2'
      );
    });

    expect(screen.getByText('pending@example.com,new@example.com')).toBeInTheDocument();
  });

  it('メンバー一覧と招待管理は同時に開かないこと', async () => {
    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: [
        {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          role: 'owner' as const,
          joinedAt: new Date('2024-01-01'),
        },
      ],
    });
    vi.mocked(listMembersForViewerAction).mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'owner',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'member-user',
          userEmail: 'member@example.com',
          displayName: '表示メンバー',
          role: 'member',
          joinedAt: new Date('2024-01-03'),
        },
      ],
    });
    vi.mocked(getInvitationsAction).mockResolvedValueOnce({
      ok: true,
      invitations: [
        {
          id: 'inv-1',
          email: 'pending@example.com',
          role: 'member',
          status: 'pending',
          inviteLink: 'https://example.test/invitations/accept?token=1',
          createdAt: new Date('2024-01-03T00:00:00Z'),
          expiresAt: new Date('2024-12-31T00:00:00Z'),
        },
      ],
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('member-list-toggle-org-1'));
    await waitFor(() => {
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('invitation-toggle-org-1'));

    await waitFor(() => {
      expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('invitation-manager-org-1')).toBeInTheDocument();
    });
  });
});
