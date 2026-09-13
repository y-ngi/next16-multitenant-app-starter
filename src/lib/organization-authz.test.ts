import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireOrganizationAccess } from './organization-authz';

// Mock auth module
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock database module
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      organization: {
        findFirst: vi.fn(),
      },
      membership: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/db';

describe('OrganizationAuthorization', () => {
  const headers = new Headers({ authorization: 'Bearer test-token' });
  const organizationId = 'org-123';
  const userId = 'user-456';

  beforeEach(() => {
    vi.clearAllMocks();
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

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

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

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // org lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: organizationId }]),
            }),
          }),
        } as any;
      } else {
        // member lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as any;
      }
    });

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

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // org lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: organizationId }]),
            }),
          }),
        } as any;
      } else {
        // member lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'mem-1', role: 'member' }]),
            }),
          }),
        } as any;
      }
    });

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

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // org lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: organizationId }]),
            }),
          }),
        } as any;
      } else {
        // member lookup
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'mem-1', role: 'owner' }]),
            }),
          }),
        } as any;
      }
    });

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
});
