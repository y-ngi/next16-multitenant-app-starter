import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalOrganizationsPage from './page';

const mockHeaders = vi.fn();
const mockRedirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT:${destination}`);
});
const mockGetSession = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => mockRedirect(destination),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('@/components/organization/organization-section', () => ({
  OrganizationSection: () => <div data-testid="organization-section">organization-section</div>,
}));

describe('PersonalOrganizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it('未認証ユーザーは /login へリダイレクトされること', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    await expect(PersonalOrganizationsPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('認証済みユーザーには所属組織の選択画面を表示すること', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        name: 'テストユーザー',
        email: 'test@example.com',
      },
    });

    const page = await PersonalOrganizationsPage();

    render(page);

    expect(screen.getByText('所属組織')).toBeInTheDocument();
    expect(screen.getByText('あなたが所属している組織を選択できます。')).toBeInTheDocument();
    expect(screen.getByTestId('organization-section')).toBeInTheDocument();
  });
});
