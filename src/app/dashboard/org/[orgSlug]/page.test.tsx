import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrganizationContextPage from './page';

const mockHeaders = vi.fn();
const mockResolveOrgContext = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

let headersData: Headers;

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

vi.mock('@/lib/organization-context', () => ({
  resolveOrgContext: (...args: unknown[]) => mockResolveOrgContext(...args),
}));

describe('OrganizationContextPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('組織名・slug・自分のロールを表示すること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });

    const page = await OrganizationContextPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'acme');
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.getAllByText('Acme Inc.')).toHaveLength(2);
    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.getAllByText('オーナー')).toHaveLength(2);
  });

  it('想定外に解決できない場合は notFound() を呼ぶこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'organization-not-found',
    });

    await expect(
      OrganizationContextPage({
        params: Promise.resolve({ orgSlug: 'missing-org' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('missing-org')).not.toBeInTheDocument();
  });
});
