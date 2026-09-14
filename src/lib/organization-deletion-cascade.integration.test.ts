// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

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
    delete: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/db';
import { organization } from '@/db/schema';
import { deleteOrganization } from './organization-member-management';
import { resolveOrgContext } from './organization-context';

function asDbSelectReturn<T>(chain: T): ReturnType<typeof db.select> {
  return chain as unknown as ReturnType<typeof db.select>;
}

function asDbDeleteReturn<T>(chain: T): ReturnType<typeof db.delete> {
  return chain as unknown as ReturnType<typeof db.delete>;
}

function createDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function mockSelectSequence(resultSets: readonly unknown[][]) {
  let callCount = 0;

  vi.mocked(db.select).mockImplementation(() => {
    const resultSet = resultSets[callCount] ?? [];
    callCount += 1;

    return asDbSelectReturn({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(resultSet),
        }),
      }),
    });
  });
}

describe('organization deletion cascade integration', () => {
  const headers = new Headers({ authorization: 'Bearer test' });
  const organizationId = 'org-1';
  const slug = 'acme-inc';
  const session = {
    user: { id: 'owner-user-1' },
    session: { id: 'session-1' },
  } as unknown as NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('組織削除後は resolveOrgContext が organization-not-found を返すこと', async () => {
    const deleteChain = createDeleteChain();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(auth.api.getSession)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    mockSelectSequence([
      [{ id: organizationId, name: 'Acme Inc.', slug }],
      [{ id: 'membership-1', role: 'owner' }],
      [],
    ]);
    vi.mocked(db.delete).mockReturnValueOnce(asDbDeleteReturn(deleteChain));

    const deleteResult = await deleteOrganization({ headers, slug });
    const contextResult = await resolveOrgContext(headers, slug);

    // 実DB統合基盤がないため、このテストは PostgreSQL の onDelete: cascade 自体を再現しない。
    // 代わりに、service 層で「組織行を削除する → 以後の組織コンテキスト解決が失敗する」
    // という観測可能な流れをモック DB で検証し、membership / invitation の実削除は
    // design.md / research.md に記載された DB 制約の責務として扱う。
    expect(deleteResult).toEqual({ ok: true });
    expect(db.delete).toHaveBeenCalledWith(organization);
    expect(deleteChain.where).toHaveBeenCalledWith(eq(organization.id, organizationId));

    expect(contextResult).toEqual({
      ok: false,
      reason: 'organization-not-found',
    });
    expect(auth.api.getSession).toHaveBeenCalledTimes(2);
    expect(db.select).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[requireOrganizationAccessBySlug] Organization not found for slug: ${slug}`
    );

    consoleErrorSpy.mockRestore();
  });
});
