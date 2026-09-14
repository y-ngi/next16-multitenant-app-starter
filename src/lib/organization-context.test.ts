// @vitest-environment node

import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const { mockRequireOrganizationAccessBySlug } = vi.hoisted(() => ({
  mockRequireOrganizationAccessBySlug: vi.fn(),
}));

vi.mock('react', async () => {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const reactServer = require(`${process.cwd()}/node_modules/react/cjs/react.react-server.development.js`);

  return {
    ...reactServer,
  };
});

vi.mock('@/lib/organization-authz', () => ({
  requireOrganizationAccessBySlug: mockRequireOrganizationAccessBySlug,
}));

function getReactServerInternals() {
  const reactServer = require(`${process.cwd()}/node_modules/react/cjs/react.react-server.development.js`) as {
    __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
      A: null | {
        getCacheForType: (resourceType: () => Map<unknown, unknown>) => Map<unknown, unknown>;
        cacheSignal?: () => null;
        getOwner?: () => null;
      };
    };
  };

  return reactServer.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
}

async function runInRequestCacheScope<T>(callback: () => Promise<T>): Promise<T> {
  const internals = getReactServerInternals();
  const previousDispatcher = internals.A;
  const requestCaches = new Map<() => Map<unknown, unknown>, Map<unknown, unknown>>();

  internals.A = {
    getCacheForType(resourceType) {
      const existingCache = requestCaches.get(resourceType);
      if (existingCache) {
        return existingCache;
      }

      const createdCache = resourceType();
      requestCaches.set(resourceType, createdCache);
      return createdCache;
    },
    cacheSignal: () => null,
    getOwner: () => null,
  };

  try {
    return await callback();
  } finally {
    internals.A = previousDispatcher;
  }
}

describe('resolveOrgContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('同一リクエスト内で同じ headers と slug の解決を 1 回に集約すること', async () => {
    const headers = new Headers({ authorization: 'Bearer test-token' });
    const slug = 'acme-inc';
    const expectedResult = {
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc',
      organizationSlug: slug,
      userId: 'user-1',
      role: 'owner',
    } as const;

    mockRequireOrganizationAccessBySlug.mockResolvedValue(expectedResult);

    const { resolveOrgContext } = await import('./organization-context');

    await runInRequestCacheScope(async () => {
      const firstCall = resolveOrgContext(headers, slug);
      const secondCall = resolveOrgContext(headers, slug);

      expect(secondCall).toBe(firstCall);
      await expect(firstCall).resolves.toEqual(expectedResult);
      await expect(secondCall).resolves.toEqual(expectedResult);
    });

    expect(mockRequireOrganizationAccessBySlug).toHaveBeenCalledTimes(1);
    expect(mockRequireOrganizationAccessBySlug).toHaveBeenCalledWith({ headers, slug });
  });

  it('同一リクエスト内でも slug が異なれば別々に解決すること', async () => {
    const headers = new Headers({ authorization: 'Bearer test-token' });
    const firstSlug = 'acme-inc';
    const secondSlug = 'beta-inc';

    mockRequireOrganizationAccessBySlug.mockResolvedValue({
      ok: false,
      reason: 'organization-not-found',
    });

    const { resolveOrgContext } = await import('./organization-context');

    await runInRequestCacheScope(async () => {
      await resolveOrgContext(headers, firstSlug);
      await resolveOrgContext(headers, secondSlug);
    });

    expect(mockRequireOrganizationAccessBySlug).toHaveBeenCalledTimes(2);
    expect(mockRequireOrganizationAccessBySlug).toHaveBeenNthCalledWith(1, {
      headers,
      slug: firstSlug,
    });
    expect(mockRequireOrganizationAccessBySlug).toHaveBeenNthCalledWith(2, {
      headers,
      slug: secondSlug,
    });
  });
});
