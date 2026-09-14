import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitationRecord } from '@/components/organization/invitation-manager';
import type { ViewableMember } from '@/lib/organization-member-management';
import MembersPage from './page';

const {
  mockCreateInvitationAction,
  mockGetInvitationsAction,
  mockHeaders,
  mockListMembersForViewer,
  mockNotFound,
  mockRefresh,
  mockResolveOrgContext,
} = vi.hoisted(() => ({
  mockCreateInvitationAction: vi.fn(),
  mockGetInvitationsAction: vi.fn(),
  mockHeaders: vi.fn(),
  mockListMembersForViewer: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  mockRefresh: vi.fn(),
  mockResolveOrgContext: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('@/lib/organization-context', () => ({
  resolveOrgContext: (...args: unknown[]) => mockResolveOrgContext(...args),
}));

vi.mock('@/lib/organization-member-management', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organization-member-management')>(
    '@/lib/organization-member-management'
  );

  return {
    ...actual,
    listMembersForViewer: (...args: unknown[]) => mockListMembersForViewer(...args),
  };
});

vi.mock('@/app/actions/organization', () => ({
  createInvitationAction: (...args: unknown[]) => mockCreateInvitationAction(...args),
  getInvitationsAction: (...args: unknown[]) => mockGetInvitationsAction(...args),
}));

vi.mock('@/app/actions/organization-member-management', () => ({
  removeMemberAction: vi.fn(),
  changeMemberRoleAction: vi.fn(),
  cancelInvitationAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function createMember(overrides: Partial<ViewableMember> = {}): ViewableMember {
  return {
    id: overrides.id ?? 'membership-1',
    userId: overrides.userId ?? 'user-1',
    userName: overrides.userName ?? 'user-1',
    userEmail: overrides.userEmail,
    displayName: overrides.displayName ?? null,
    role: overrides.role ?? 'member',
    joinedAt: overrides.joinedAt ?? new Date('2024-01-01T00:00:00.000Z'),
  };
}

function createInvitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: overrides.id ?? 'inv-1',
    email: overrides.email ?? 'invitee@example.com',
    role: overrides.role ?? 'member',
    status: overrides.status ?? 'pending',
    inviteLink: overrides.inviteLink ?? 'https://example.test/invitations/accept?token=invite-1',
    createdAt: overrides.createdAt ?? new Date('2024-01-02T00:00:00.000Z'),
    expiresAt: overrides.expiresAt ?? new Date('2024-01-09T00:00:00.000Z'),
    mailSent: overrides.mailSent,
  };
}

describe('members role visibility integration', () => {
  let headersData: Headers;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('owner ではメールと管理 UI を表示し、自分の行には操作ボタンを表示しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'viewer-1',
      role: 'owner',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'owner',
      members: [
        createMember({
          id: 'membership-owner-self',
          userId: 'viewer-1',
          userName: 'owner-self',
          userEmail: 'owner-self@example.com',
          displayName: 'オーナー本人',
          role: 'owner',
        }),
        createMember({
          id: 'membership-member-1',
          userId: 'member-1',
          userName: 'member-1',
          userEmail: 'member-1@example.com',
          displayName: '一般メンバー',
          role: 'member',
          joinedAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        createMember({
          id: 'membership-owner-2',
          userId: 'owner-2',
          userName: 'owner-2',
          userEmail: 'owner-2@example.com',
          displayName: '別のオーナー',
          role: 'owner',
          joinedAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
      ] satisfies readonly ViewableMember[],
    });
    mockGetInvitationsAction.mockResolvedValueOnce({
      ok: true,
      invitations: [
        createInvitation(),
        createInvitation({
          id: 'inv-2',
          email: 'accepted@example.com',
          status: 'accepted',
        }),
      ] satisfies readonly InvitationRecord[],
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'AcMe' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'AcMe');
    expect(mockListMembersForViewer).toHaveBeenCalledWith({ headers: headersData, slug: 'acme' });
    expect(mockGetInvitationsAction).toHaveBeenCalledWith('org-1');

    expect(screen.getByText('owner-self@example.com')).toBeInTheDocument();
    expect(screen.getByText('member-1@example.com')).toBeInTheDocument();
    expect(screen.getByText('owner-2@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('削除')).toHaveLength(2);
    expect(screen.getByText('owner に変更')).toBeInTheDocument();
    expect(screen.getByText('member に変更')).toBeInTheDocument();
    expect(screen.getByText('メンバーを招待')).toBeInTheDocument();
    expect(screen.getByText('招待履歴')).toBeInTheDocument();
    expect(screen.getByText('invitee@example.com')).toBeInTheDocument();
    expect(screen.getByText('招待を取り消す')).toBeInTheDocument();

    const ownCard = screen.getByText('オーナー本人').closest('[data-slot="card"]');
    const memberCard = screen.getByText('一般メンバー').closest('[data-slot="card"]');
    const otherOwnerCard = screen.getByText('別のオーナー').closest('[data-slot="card"]');

    expect(ownCard).not.toBeNull();
    expect(memberCard).not.toBeNull();
    expect(otherOwnerCard).not.toBeNull();

    expect(within(ownCard as HTMLElement).queryByText('削除')).not.toBeInTheDocument();
    expect(within(ownCard as HTMLElement).queryByText('owner に変更')).not.toBeInTheDocument();
    expect(within(ownCard as HTMLElement).queryByText('member に変更')).not.toBeInTheDocument();
    expect(within(memberCard as HTMLElement).getByText('owner に変更')).toBeInTheDocument();
    expect(within(memberCard as HTMLElement).getByText('削除')).toBeInTheDocument();
    expect(within(otherOwnerCard as HTMLElement).getByText('member に変更')).toBeInTheDocument();
    expect(within(otherOwnerCard as HTMLElement).getByText('削除')).toBeInTheDocument();
  });

  it('member ではメールと管理操作と招待 UI を表示しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'viewer-2',
      role: 'member',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'member',
      members: [
        createMember({
          id: 'membership-member-self',
          userId: 'viewer-2',
          userName: 'member-self',
          displayName: '自分',
          role: 'member',
        }),
        createMember({
          id: 'membership-owner-1',
          userId: 'owner-1',
          userName: 'owner-1',
          displayName: 'オーナー',
          role: 'owner',
          joinedAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
        createMember({
          id: 'membership-member-2',
          userId: 'member-2',
          userName: 'member-2',
          displayName: 'メールなしメンバー',
          role: 'member',
          joinedAt: new Date('2024-01-03T00:00:00.000Z'),
        }),
      ] satisfies readonly ViewableMember[],
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'acme');
    expect(mockListMembersForViewer).toHaveBeenCalledWith({ headers: headersData, slug: 'acme' });
    expect(mockGetInvitationsAction).not.toHaveBeenCalled();

    expect(screen.queryByText(/@example\.com$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'owner に変更' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'member に変更' })).not.toBeInTheDocument();
    expect(screen.queryByText('メンバーを招待')).not.toBeInTheDocument();
    expect(screen.queryByText('招待履歴')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '招待を取り消す' })).not.toBeInTheDocument();
    expect(screen.getByText('自分')).toBeInTheDocument();
    expect(screen.getAllByText('オーナー')).not.toHaveLength(0);
    expect(screen.getByText('メールなしメンバー')).toBeInTheDocument();
  });

  it('非メンバーでは notFound し、メンバー情報を表示しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'not-member',
    });

    await expect(
      MembersPage({
        params: Promise.resolve({ orgSlug: 'acme' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockListMembersForViewer).not.toHaveBeenCalled();
    expect(mockGetInvitationsAction).not.toHaveBeenCalled();
    expect(document.body).toBeEmptyDOMElement();
    expect(screen.queryByText('オーナー本人')).not.toBeInTheDocument();
    expect(screen.queryByText('owner-self@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('一般メンバー')).not.toBeInTheDocument();
    expect(screen.queryByText('invitee@example.com')).not.toBeInTheDocument();
  });
});
