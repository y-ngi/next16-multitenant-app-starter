import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationLayout from './layout';

const mockHeaders = vi.fn();
const mockResolveOrgContext = vi.fn();
const mockRedirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT:${destination}`);
});
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
let headersData: Headers;

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => mockRedirect(destination),
  notFound: () => mockNotFound(),
}));

vi.mock('@/lib/organization-context', () => ({
  resolveOrgContext: (...args: unknown[]) => mockResolveOrgContext(...args),
}));

describe('OrganizationLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('未認証時は /login へリダイレクトすること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
    });

    await expect(
      OrganizationLayout({
        params: Promise.resolve({ orgSlug: 'acme' }),
        children: <div>child content</div>,
      })
    ).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(mockRedirect).toHaveBeenCalledWith('/login');
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Inc.')).not.toBeInTheDocument();
  });

  it('組織不存在時は notFound() を呼ぶこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'organization-not-found',
    });

    await expect(
      OrganizationLayout({
        params: Promise.resolve({ orgSlug: 'missing-org' }),
        children: <div>child content</div>,
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Inc.')).not.toBeInTheDocument();
  });

  it('非所属時は notFound() を呼ぶこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'not-member',
    });

    await expect(
      OrganizationLayout({
        params: Promise.resolve({ orgSlug: 'other-org' }),
        children: <div>child content</div>,
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Inc.')).not.toBeInTheDocument();
  });

  it('所属確認済みの場合のみ組織名ヘッダーと children を描画すること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });

    const layout = await OrganizationLayout({
      params: Promise.resolve({ orgSlug: 'acme' }),
      children: <div>child content</div>,
    });

    render(layout);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'acme');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.getByText('Acme Inc.')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
