import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrganizationList } from './organization-list';

// Mock the server actions
vi.mock('@/app/actions/organization', () => ({
  getUserOrganizationsAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
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
      expect(
        screen.getByText('所属している組織がありません。新しい組織を作成してください。')
      ).toBeInTheDocument();
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
});
