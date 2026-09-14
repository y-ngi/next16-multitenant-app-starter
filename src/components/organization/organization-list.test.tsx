import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrganizationList } from './organization-list';

// Mock the server actions
vi.mock('@/app/actions/organization', () => ({
  getUserOrganizationsAction: vi.fn(),
  getOrganizationMembersAction: vi.fn(),
  getInvitationsAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock child components to avoid complex dependencies
vi.mock('./member-list', () => ({
  MemberList: ({ organizationId }: { organizationId: string }) => (
    <div data-testid={`member-list-${organizationId}`}>Mock Member List</div>
  ),
}));

vi.mock('./invitation-manager', () => ({
  InvitationManager: ({ organizationId }: { organizationId: string }) => (
    <div data-testid={`invitation-manager-${organizationId}`}>Mock Invitation Manager</div>
  ),
}));

import { getUserOrganizationsAction } from '@/app/actions/organization';

describe('OrganizationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('読み込み中はスケルトンを表示すること', () => {
    vi.mocked(getUserOrganizationsAction).mockImplementationOnce(
      () => new Promise(() => {})
    );

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
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
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
    const testDate = new Date('2024-01-15');
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: testDate,
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByText(/に参加/)).toBeInTheDocument();
    });
  });

  it('メンバー一覧ボタンをクリックするとメンバーリストが表示されること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    // Initially, member list should not be visible
    expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();

    // Click the member list button
    const memberListButton = screen.getByTestId('member-list-toggle-org-1');
    fireEvent.click(memberListButton);

    // Now member list should be visible
    await waitFor(() => {
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
    });
  });

  it('メンバー一覧ボタンをもう一度クリックするとメンバーリストが閉じること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    const memberListButton = screen.getByTestId('member-list-toggle-org-1');

    // Click to open
    fireEvent.click(memberListButton);
    await waitFor(() => {
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
    });

    // Click to close
    fireEvent.click(memberListButton);
    await waitFor(() => {
      expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();
    });
  });

  it('オーナー権限で招待管理ボタンが表示されること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-toggle-org-1')).toBeInTheDocument();
    });
  });

  it('メンバー権限で招待管理ボタンが表示されないこと', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'member' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.queryByTestId('invitation-toggle-org-1')).not.toBeInTheDocument();
    });
  });

  it('招待管理ボタンをクリックするとInvitationManagerが表示されること', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('invitation-toggle-org-1')).toBeInTheDocument();
    });

    // Initially, invitation manager should not be visible
    expect(screen.queryByTestId('invitation-manager-org-1')).not.toBeInTheDocument();

    // Click the invitation button
    const invitationButton = screen.getByTestId('invitation-toggle-org-1');
    fireEvent.click(invitationButton);

    // Now invitation manager should be visible
    await waitFor(() => {
      expect(screen.getByTestId('invitation-manager-org-1')).toBeInTheDocument();
    });
  });

  it('メンバー一覧と招待管理は同時に開かないこと', async () => {
    const mockOrganizations = [
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getUserOrganizationsAction).mockResolvedValueOnce({
      ok: true,
      organizations: mockOrganizations,
    });

    render(<OrganizationList />);

    await waitFor(() => {
      expect(screen.getByTestId('member-list-toggle-org-1')).toBeInTheDocument();
    });

    // Open member list
    fireEvent.click(screen.getByTestId('member-list-toggle-org-1'));
    await waitFor(() => {
      expect(screen.getByTestId('member-list-org-1')).toBeInTheDocument();
    });

    // Open invitation manager
    fireEvent.click(screen.getByTestId('invitation-toggle-org-1'));

    // Member list should be closed
    await waitFor(() => {
      expect(screen.queryByTestId('member-list-org-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('invitation-manager-org-1')).toBeInTheDocument();
    });
  });
});
