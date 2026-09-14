import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './page';

const {
  changeMemberRoleActionMock,
  deleteOrganizationActionMock,
  leaveOrganizationActionMock,
  mockHeaders,
  mockNotFound,
  mockPush,
  mockRefresh,
  mockResolveOrgContext,
} = vi.hoisted(() => ({
  changeMemberRoleActionMock: vi.fn(),
  deleteOrganizationActionMock: vi.fn(),
  leaveOrganizationActionMock: vi.fn(),
  mockHeaders: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockResolveOrgContext: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock('@/lib/organization-context', () => ({
  resolveOrgContext: (...args: unknown[]) => mockResolveOrgContext(...args),
}));

vi.mock('@/app/actions/organization-member-management', () => ({
  changeMemberRoleAction: changeMemberRoleActionMock,
  deleteOrganizationAction: deleteOrganizationActionMock,
  leaveOrganizationAction: leaveOrganizationActionMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('settings member permissions integration', () => {
  let headersData: Headers;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('member では脱退操作のみ表示し、owner 専用の危険な操作を表示しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-2',
      role: 'member',
    });

    const page = await SettingsPage({
      params: Promise.resolve({ orgSlug: 'AcMe' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'AcMe');
    expect(screen.getByRole('button', { name: '組織から脱退する' })).toBeInTheDocument();
    expect(screen.queryByText('危険な操作')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '自分をmemberに変更' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '組織を削除' })).not.toBeInTheDocument();
  });
});
