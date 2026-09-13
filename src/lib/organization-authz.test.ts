import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireOrganizationAccess, requireOrganizationAccessBySlug } from './organization-authz';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    eq: vi.fn((column, value) => ({ type: 'eq', column, value })),
    and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/db';

function mockSelectSequence(resultSets: unknown[][]) {
  const whereCalls: unknown[] = [];
  let callCount = 0;

  vi.mocked(db.select).mockImplementation(() => {
    const resultSet = resultSets[callCount] ?? [];
    callCount += 1;

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition) => {
          whereCalls.push(condition);
          return {
            limit: vi.fn().mockResolvedValue(resultSet),
          };
        }),
      }),
    } as any;
  });

  return { whereCalls };
}

describe('OrganizationAuthorization', () => {
  const headers = new Headers({ authorization: '******' });
  const organizationId = 'org-123';
  const organizationName = 'Acme Inc';
  const organizationSlug = 'acme-inc';
  const userId = 'user-456';
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('未認証の場合、unauthenticated エラーを返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any);

    const result = await requireOrganizationAccess({
      headers,
      organizationId,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('組織が存在しない場合、organization-not-found エラーを返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-1' },
    } as any);

    mockSelectSequence([[]]);

    const result = await requireOrganizationAccess({
      headers,
      organizationId,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'organization-not-found',
    });
  });

  it('ユーザーが組織のメンバーでない場合、not-member エラーを返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-1' },
    } as any);

    mockSelectSequence([[{ id: organizationId }], []]);

    const result = await requireOrganizationAccess({
      headers,
      organizationId,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not-member',
    });
  });

  it('member ロールのユーザーが owner ロールを要求する操作を行う場合、insufficient-role エラーを返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-1' },
    } as any);

    mockSelectSequence([[{ id: organizationId }], [{ id: 'mem-1', role: 'member' }]]);

    const result = await requireOrganizationAccess({
      headers,
      organizationId,
      requiredRole: 'owner',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-role',
    });
  });

  it('認可が成功した場合、ok: true と組織情報（organizationId, userId, role）を返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-1' },
    } as any);

    mockSelectSequence([[{ id: organizationId }], [{ id: 'mem-1', role: 'owner' }]]);

    const result = await requireOrganizationAccess({
      headers,
      organizationId,
      requiredRole: 'owner',
    });

    expect(result).toEqual({
      ok: true,
      organizationId,
      userId,
      role: 'owner',
    });
  });

  it('slug からの認可が成功した場合、ok: true と組織情報を返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-2' },
    } as any);

    mockSelectSequence(
      [[{ id: organizationId, name: organizationName, slug: organizationSlug }], [{ id: 'mem-1', role: 'owner' }]]
    );

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: organizationSlug,
      requiredRole: 'owner',
    });

    expect(result).toEqual({
      ok: true,
      organizationId,
      organizationName,
      organizationSlug,
      userId,
      role: 'owner',
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('slug 認可で未認証の場合、unauthenticated エラーを返して DB を参照しないこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any);

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: organizationSlug,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[requireOrganizationAccessBySlug] Access denied: unauthenticated'
    );
  });

  it('slug に対応する組織が存在しない場合、organization-not-found エラーを返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-3' },
    } as any);

    mockSelectSequence([[]]);

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: organizationSlug,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'organization-not-found',
    });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[requireOrganizationAccessBySlug] Organization not found for slug: ${organizationSlug}`
    );
  });

  // membership テーブルに行が存在しない状態は、保留中・拒否済み・期限切れ・無効な招待だけが
  // 存在する状態と区別できない（invitation は membership を作成しない）。そのため、
  // どちらのケースも同一のクエリ結果（membership 該当なし）で表現され、自然に not-member へ
  // 合流することを本テストで検証する（要件 3.4）。
  it('組織が存在してもメンバーシップがない場合（保留中・拒否済み・期限切れ・無効な招待だけの状態を含む）、slug 認可は not-member を返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-4' },
    } as any);

    mockSelectSequence([[{ id: organizationId, name: organizationName, slug: organizationSlug }], []]);

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: organizationSlug,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not-member',
    });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[requireOrganizationAccessBySlug] User is not a member of organization: ${organizationId}`
    );
  });

  it('slug 認可で owner ロールが必要かつユーザーが member の場合、insufficient-role を返すこと', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-6' },
    } as any);

    mockSelectSequence(
      [[{ id: organizationId, name: organizationName, slug: organizationSlug }], [{ id: 'mem-2', role: 'member' }]]
    );

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: organizationSlug,
      requiredRole: 'owner',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-role',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[requireOrganizationAccessBySlug] User role is insufficient for organization: ${organizationId}`
    );
  });

  it('slug の大文字と前後空白を正規化して同じ組織を解決すること', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: userId },
      session: { id: 'sess-7' },
    } as any);

    const { whereCalls } = mockSelectSequence(
      [[{ id: organizationId, name: organizationName, slug: organizationSlug }], [{ id: 'mem-3', role: 'member' }]]
    );

    const result = await requireOrganizationAccessBySlug({
      headers,
      slug: '  ACME-INC  ',
    });

    expect(result).toEqual({
      ok: true,
      organizationId,
      organizationName,
      organizationSlug,
      userId,
      role: 'member',
    });
    expect(whereCalls[0]).toMatchObject({
      type: 'eq',
      value: organizationSlug,
    });
  });
});
