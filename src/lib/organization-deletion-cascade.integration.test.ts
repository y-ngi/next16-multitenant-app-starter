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
import { invitation, membership, organization } from '@/db/schema';
import { deleteOrganization } from './organization-member-management';
import { resolveOrgContext } from './organization-context';

function asDbSelectReturn<T>(chain: T): ReturnType<typeof db.select> {
  return chain as unknown as ReturnType<typeof db.select>;
}

function asDbDeleteReturn<T>(chain: T): ReturnType<typeof db.delete> {
  return chain as unknown as ReturnType<typeof db.delete>;
}

function createDeleteChain() {
  const returning = vi.fn().mockResolvedValue([{ id: 'org-1' }]);
  const where = vi.fn().mockReturnValue({
    returning,
  });

  return {
    where,
    returning,
  };
}

interface CascadeMockState {
  deleted: boolean;
  readonly organizationRows: readonly unknown[];
  readonly membershipRows: readonly unknown[];
  readonly invitationRows: readonly unknown[];
}

function mockCascadeSelectState(state: CascadeMockState) {
  vi.mocked(db.select).mockImplementation(() => {
    return asDbSelectReturn({
      from: vi.fn().mockImplementation((table) => ({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            if (state.deleted) {
              return [];
            }

            if (table === organization) {
              return state.organizationRows;
            }

            if (table === membership) {
              return state.membershipRows;
            }

            if (table === invitation) {
              return state.invitationRows;
            }

            return [];
          }),
        }),
      })),
    });
  });
}

async function findOrganizationBySlug(slug: string) {
  return db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
}

async function findMembershipsByOrganizationId(organizationId: string) {
  return db
    .select({ id: membership.id, role: membership.role })
    .from(membership)
    .where(eq(membership.organizationId, organizationId))
    .limit(10);
}

async function findInvitationsByOrganizationId(organizationId: string) {
  return db
    .select({ id: invitation.id, email: invitation.email })
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId))
    .limit(10);
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
    const organizationRows = [{ id: organizationId, name: 'Acme Inc.', slug }];
    const membershipRows = [{ id: 'membership-1', role: 'owner' }];
    const invitationRows = [{ id: 'invitation-1', email: 'invitee@example.com' }];
    const state: CascadeMockState = {
      deleted: false,
      organizationRows,
      membershipRows,
      invitationRows,
    };

    vi.mocked(auth.api.getSession)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    mockCascadeSelectState(state);
    deleteChain.where.mockImplementationOnce(() => {
      state.deleted = true;
      return {
        returning: deleteChain.returning,
      };
    });
    vi.mocked(db.delete).mockReturnValueOnce(asDbDeleteReturn(deleteChain));

    await expect(findOrganizationBySlug(slug)).resolves.toEqual(organizationRows);
    await expect(findMembershipsByOrganizationId(organizationId)).resolves.toEqual(membershipRows);
    await expect(findInvitationsByOrganizationId(organizationId)).resolves.toEqual(invitationRows);

    const deleteResult = await deleteOrganization({ headers, slug });
    const organizationsAfterDelete = await findOrganizationBySlug(slug);
    const membershipsAfterDelete = await findMembershipsByOrganizationId(organizationId);
    const invitationsAfterDelete = await findInvitationsByOrganizationId(organizationId);
    const contextResult = await resolveOrgContext(headers, slug);

    // 実DB統合基盤がないため、このテストは PostgreSQL の onDelete: cascade そのものではなく、
    // 組織 delete 呼び出しを契機に、関連 lookup が空へ遷移する観測可能な因果関係をモック DB で検証する。
    expect(deleteResult).toEqual({ ok: true });
    expect(db.delete).toHaveBeenCalledWith(organization);
    expect(deleteChain.where).toHaveBeenCalledWith(eq(organization.id, organizationId));
    expect(deleteChain.returning).toHaveBeenCalledWith({ id: organization.id });
    expect(organizationsAfterDelete).toEqual([]);
    expect(membershipsAfterDelete).toEqual([]);
    expect(invitationsAfterDelete).toEqual([]);

    expect(contextResult).toEqual({
      ok: false,
      reason: 'organization-not-found',
    });
    expect(auth.api.getSession).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[requireOrganizationAccessBySlug] Organization not found for slug: ${slug}`
    );

    consoleErrorSpy.mockRestore();
  });
});
