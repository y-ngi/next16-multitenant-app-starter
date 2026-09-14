import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitationRecord } from '@/components/organization/invitation-manager';
import type { ViewableMember } from '@/lib/organization-member-management';
import MembersPage from './page';

const {
  mockCancelInvitationAction,
  mockGetInvitationsAction,
  mockHeaders,
  mockListMembersForViewer,
  mockRefresh,
  mockResolveOrgContext,
} = vi.hoisted(() => ({
  mockCancelInvitationAction: vi.fn(),
  mockGetInvitationsAction: vi.fn(),
  mockHeaders: vi.fn(),
  mockListMembersForViewer: vi.fn(),
  mockRefresh: vi.fn(),
  mockResolveOrgContext: vi.fn(),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
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
  createInvitationAction: vi.fn(),
  getInvitationsAction: (...args: unknown[]) => mockGetInvitationsAction(...args),
}));

vi.mock('@/app/actions/organization-member-management', () => ({
  removeMemberAction: vi.fn(),
  changeMemberRoleAction: vi.fn(),
  cancelInvitationAction: (...args: unknown[]) => mockCancelInvitationAction(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function createMember(overrides: Partial<ViewableMember> = {}): ViewableMember {
  return {
    id: overrides.id ?? 'membership-owner-self',
    userId: overrides.userId ?? 'viewer-1',
    userName: overrides.userName ?? 'owner-self',
    userEmail: overrides.userEmail ?? 'owner-self@example.com',
    displayName: overrides.displayName ?? 'オーナー本人',
    role: overrides.role ?? 'owner',
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

describe('invitation cancel edge integration', () => {
  let headersData: Headers;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('owner が stale な pending 招待の取り消しを試みて invitation-not-pending を受けたら、状態エラーメッセージを表示して再取得すること', async () => {
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
      members: [createMember()] satisfies readonly ViewableMember[],
    });
    mockGetInvitationsAction.mockResolvedValueOnce({
      ok: true,
      invitations: [
        createInvitation({
          id: 'inv-processed',
          email: 'processed@example.com',
          status: 'pending',
        }),
      ] satisfies readonly InvitationRecord[],
    });
    mockCancelInvitationAction.mockResolvedValueOnce({
      ok: false,
      reason: 'invitation-not-pending',
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'AcMe' }),
    });

    render(page);

    fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }));

    await waitFor(() => {
      expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'AcMe');
      expect(mockListMembersForViewer).toHaveBeenCalledWith({ headers: headersData, slug: 'acme' });
      expect(mockGetInvitationsAction).toHaveBeenCalledWith('org-1');
      expect(mockCancelInvitationAction).toHaveBeenCalledWith('acme', 'inv-processed');
      expect(toastErrorMock).toHaveBeenCalledWith('対象の招待は既に処理済みか存在しません');
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('processed@example.com')).toBeInTheDocument();
    expect(screen.getByText('招待履歴')).toBeInTheDocument();
  });
});
