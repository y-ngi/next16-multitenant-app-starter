import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUserOrganizationsAction,
  mockHeaders,
  mockNotFound,
  mockRedirect,
  mockResolveOrgContext,
} = vi.hoisted(() => ({
  mockGetUserOrganizationsAction: vi.fn(),
  mockHeaders: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  mockRedirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  mockResolveOrgContext: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  redirect: (destination: string) => mockRedirect(destination),
}));

vi.mock('@/lib/organization-context', () => ({
  resolveOrgContext: (...args: unknown[]) => mockResolveOrgContext(...args),
}));

vi.mock('@/app/actions/organization', () => ({
  createInvitationAction: vi.fn(),
  getInvitationsAction: vi.fn(),
  getOrganizationMembersAction: vi.fn(),
  getUserOrganizationsAction: (...args: unknown[]) => mockGetUserOrganizationsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import OrganizationLayout from './layout';
import OrganizationContextPage from './page';
import { OrganizationList } from '@/components/organization/organization-list';

describe('organization context flow integration', () => {
  let headersData: Headers;

  beforeEach(() => {
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('所属組織の選択導線から組織コンテキスト画面までの一連の流れを構成できること', async () => {
    const organization = {
      id: 'org-1',
      name: 'Acme Inc.',
      slug: 'acme-inc',
      role: 'owner' as const,
      joinedAt: new Date('2024-01-01'),
    };

    mockGetUserOrganizationsAction.mockResolvedValueOnce({
      ok: true,
      organizations: [organization],
    });

    mockResolveOrgContext.mockResolvedValue({
      ok: true,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      userId: 'user-1',
      role: organization.role,
    });

    render(<OrganizationList />);

    const openOrganizationLink = await screen.findByRole('link', {
      name: '組織を開く',
    });

    expect(openOrganizationLink).toHaveAttribute(
      'href',
      `/dashboard/org/${organization.slug}`
    );

    cleanup();

    const page = await OrganizationContextPage({
      params: Promise.resolve({ orgSlug: organization.slug }),
    });
    const layout = await OrganizationLayout({
      params: Promise.resolve({ orgSlug: organization.slug }),
      children: page,
    });

    render(layout);

    expect(mockResolveOrgContext).toHaveBeenNthCalledWith(1, headersData, organization.slug);
    expect(mockResolveOrgContext).toHaveBeenNthCalledWith(2, headersData, organization.slug);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.getByText('現在の組織')).toBeInTheDocument();
    expect(screen.getAllByText(organization.name)).toHaveLength(3);
    expect(screen.getByText(organization.slug)).toBeInTheDocument();
    expect(screen.getAllByText('オーナー')).toHaveLength(2);
    expect(screen.getByText('組織コンテキストを確認できます。')).toBeInTheDocument();
  });

  it('非所属の slug へ直接アクセスしたときは layout と page の両方が 404 経路に合流し組織情報を表示しないこと', async () => {
    const orgSlug = 'outside-org';

    mockResolveOrgContext.mockResolvedValue({
      ok: false,
      reason: 'not-member',
    });

    const pagePromise = OrganizationContextPage({
      params: Promise.resolve({ orgSlug }),
    });
    const layoutPromise = OrganizationLayout({
      params: Promise.resolve({ orgSlug }),
      children: <div>leaked child content</div>,
    });

    await expect(pagePromise).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(layoutPromise).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockResolveOrgContext).toHaveBeenNthCalledWith(1, headersData, orgSlug);
    expect(mockResolveOrgContext).toHaveBeenNthCalledWith(2, headersData, orgSlug);
    expect(mockNotFound).toHaveBeenCalledTimes(2);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.queryByText('現在の組織')).not.toBeInTheDocument();
    expect(screen.queryByText('leaked child content')).not.toBeInTheDocument();
    expect(screen.queryByText(orgSlug)).not.toBeInTheDocument();
    expect(screen.queryByText('オーナー')).not.toBeInTheDocument();
    expect(screen.queryByText('メンバー')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockNotFound).toHaveBeenCalled();
    });
  });
});
