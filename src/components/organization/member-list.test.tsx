import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemberList } from './member-list';

// Mock the server actions
vi.mock('@/app/actions/organization', () => ({
  getOrganizationMembersAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { getOrganizationMembersAction } from '@/app/actions/organization';

describe('MemberList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('読み込み中はスケルトンを表示すること', () => {
    vi.mocked(getOrganizationMembersAction).mockImplementationOnce(
      () => new Promise(() => {})
    );

    const { container } = render(<MemberList organizationId="org-1" />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('メンバー一覧を表示すること', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        userName: 'Owner User',
        userEmail: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'mem-2',
        userId: 'user-2',
        userName: 'Member User',
        userEmail: 'member@example.com',
        displayName: 'Member',
        role: 'member' as const,
        joinedAt: new Date('2024-01-02'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: mockMembers,
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('owner@example.com')).toBeInTheDocument();
      expect(screen.getByText('member@example.com')).toBeInTheDocument();
    });
  });

  it('メンバーの表示名を表示すること', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        userName: 'Owner User',
        userEmail: 'owner@example.com',
        displayName: 'Owner Display',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: mockMembers,
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText('Owner Display')).toBeInTheDocument();
    });
  });

  it('オーナーバッジを表示すること', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        userName: 'Owner User',
        userEmail: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: mockMembers,
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      const ownerBadge = screen.getByText('オーナー');
      expect(ownerBadge).toBeInTheDocument();
    });
  });

  it('メンバーバッジを表示すること', async () => {
    const mockMembers = [
      {
        id: 'mem-2',
        userId: 'user-2',
        userName: 'Member User',
        userEmail: 'member@example.com',
        displayName: 'Member',
        role: 'member' as const,
        joinedAt: new Date('2024-01-02'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: mockMembers,
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      const memberBadge = screen.getByText('メンバー');
      expect(memberBadge).toBeInTheDocument();
    });
  });

  it('参加日時を表示すること', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        userName: 'Owner User',
        userEmail: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: mockMembers,
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText(/2024年1月1日/)).toBeInTheDocument();
    });
  });

  it('エラーメッセージを表示すること', async () => {
    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: false,
      error: 'メンバーの取得に失敗しました',
    });

    const { container } = render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      const errorCard = container.querySelector('.bg-red-50');
      expect(errorCard).toBeInTheDocument();
    });
  });

  it('メンバーが存在しない場合、空状態を表示すること', async () => {
    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: true,
      members: [],
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText(/メンバーがいません/)).toBeInTheDocument();
    });
  });

  it('refreshKeyが変更されたときに再取得すること', async () => {
    const mockMembers = [
      {
        id: 'mem-1',
        userId: 'user-1',
        userName: 'Owner User',
        userEmail: 'owner@example.com',
        displayName: 'Owner',
        role: 'owner' as const,
        joinedAt: new Date('2024-01-01'),
      },
    ];

    vi.mocked(getOrganizationMembersAction).mockResolvedValue({
      ok: true,
      members: mockMembers,
    });

    const { rerender } = render(<MemberList organizationId="org-1" refreshKey={0} />);

    await waitFor(() => {
      expect(getOrganizationMembersAction).toHaveBeenCalledTimes(1);
    });

    rerender(<MemberList organizationId="org-1" refreshKey={1} />);

    await waitFor(() => {
      expect(getOrganizationMembersAction).toHaveBeenCalledTimes(2);
    });
  });

  it('エラーをトーストで表示すること', async () => {
    const { toast } = await import('sonner');

    vi.mocked(getOrganizationMembersAction).mockResolvedValueOnce({
      ok: false,
      error: 'アクセスが拒否されました',
    });

    render(<MemberList organizationId="org-1" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('アクセスが拒否されました');
    });
  });
});
