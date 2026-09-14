import { existsSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalDashboardPage from './page';

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

vi.mock('@/components/sign-out-button', () => ({
  SignOutButton: () => <div data-testid="sign-out-button">ログアウト</div>,
}));

vi.mock('@/components/organization/organization-section', () => ({
  OrganizationSection: () => <div data-testid="organization-section">organization-section</div>,
}));

describe('PersonalDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it('認証済みユーザーには既存マイページの内容を表示すること', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        name: 'テストユーザー',
        email: 'test@example.com',
      },
    });

    const page = await PersonalDashboardPage();

    render(page);

    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('テストユーザー')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
    expect(screen.getByText('所属組織')).toBeInTheDocument();
    expect(screen.getByTestId('organization-section')).toBeInTheDocument();
  });

  it('未認証ユーザーは /login へリダイレクトされること', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    await expect(PersonalDashboardPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('旧ルートの page.tsx は削除されていること', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/app/dashboard/page.tsx'))).toBe(false);
  });
});
