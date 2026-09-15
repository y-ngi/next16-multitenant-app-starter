import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MembersPage from './page';

interface MockViewableMember {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail?: string;
  readonly displayName?: string | null;
  readonly role: 'owner' | 'member';
  readonly joinedAt: Date;
}

interface MockInvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly role?: string;
  readonly status: string;
  readonly inviteLink: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly mailSent?: boolean;
}

interface MockMemberListProps {
  readonly members: readonly MockViewableMember[];
  readonly viewerRole: 'owner' | 'member';
  readonly viewerUserId: string;
  readonly onRemoveMember: (targetUserId: string) => Promise<unknown>;
  readonly onChangeRole: (
    targetUserId: string,
    newRole: 'owner' | 'member'
  ) => Promise<unknown>;
}

interface MockInvitationManagerProps {
  readonly organizationId: string;
  readonly invitations: readonly MockInvitationRecord[];
  readonly onCancelInvitation?: (invitationId: string) => Promise<unknown>;
  readonly listFetchError?: string;
}

const memberListMock = vi.hoisted(() =>
  vi.fn(({ members, viewerRole, viewerUserId, onRemoveMember, onChangeRole }: MockMemberListProps) => (
    <div
      data-testid="member-list"
      data-member-count={String(members.length)}
      data-viewer-role={viewerRole}
      data-viewer-user-id={viewerUserId}
      data-has-remove-member={typeof onRemoveMember === 'function' ? 'yes' : 'no'}
      data-has-change-role={typeof onChangeRole === 'function' ? 'yes' : 'no'}
    />
  ))
);

const invitationManagerMock = vi.hoisted(() =>
  vi.fn(({ organizationId, invitations, onCancelInvitation, listFetchError }: MockInvitationManagerProps) => (
    <div
      data-testid="invitation-manager"
      data-organization-id={organizationId}
      data-invitation-count={String(invitations.length)}
      data-has-cancel-invitation={typeof onCancelInvitation === 'function' ? 'yes' : 'no'}
    >
      <form>
        <label htmlFor="invitation-manager-email">メールアドレス</label>
        <input id="invitation-manager-email" name="email" type="email" />
        <button type="submit">送信</button>
      </form>
      {listFetchError ? <div>{listFetchError}</div> : null}
      {invitations.length === 0 ? <div>招待はまだありません</div> : null}
    </div>
  ))
);

const mockHeaders = vi.fn();
const mockResolveOrgContext = vi.fn();
const mockListMembersForViewer = vi.fn();
const mockGetInvitationsAction = vi.fn();
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

vi.mock('@/lib/organization-member-management', () => ({
  listMembersForViewer: (...args: unknown[]) => mockListMembersForViewer(...args),
}));

vi.mock('@/app/actions/organization', () => ({
  getInvitationsAction: (...args: unknown[]) => mockGetInvitationsAction(...args),
}));

vi.mock('@/app/actions/organization-member-management', () => ({
  removeMemberAction: vi.fn(),
  changeMemberRoleAction: vi.fn(),
  cancelInvitationAction: vi.fn(),
}));

vi.mock('@/components/organization/member-list', () => ({
  MemberList: memberListMock,
}));

vi.mock('@/components/organization/invitation-manager', () => ({
  InvitationManager: invitationManagerMock,
}));

describe('MembersPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    memberListMock.mockClear();
    invitationManagerMock.mockClear();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('owner は組織コンテキストを唯一の基準としてメンバー一覧と招待管理を表示すること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-from-members-result',
      viewerRole: 'member',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'Owner User',
          userEmail: 'owner@example.com',
          displayName: 'Owner User',
          role: 'owner',
          joinedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    });
    mockGetInvitationsAction.mockResolvedValueOnce({
      ok: true,
      invitations: [
        {
          id: 'inv-1',
          email: 'invitee@example.com',
          role: 'member',
          status: 'pending',
          inviteLink: 'https://example.test/invitations/accept?token=token-1',
          createdAt: new Date('2024-01-02T00:00:00Z'),
          expiresAt: new Date('2024-01-09T00:00:00Z'),
        },
      ],
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'AcMe' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'AcMe');
    expect(mockListMembersForViewer).toHaveBeenCalledWith({ headers: headersData, slug: 'acme' });
    expect(mockGetInvitationsAction).toHaveBeenCalledWith('org-1');

    expect(screen.getByTestId('member-list')).toHaveAttribute('data-member-count', '1');
    expect(screen.getByTestId('member-list')).toHaveAttribute('data-viewer-role', 'owner');
    expect(screen.getByTestId('member-list')).toHaveAttribute('data-viewer-user-id', 'user-1');
    expect(screen.getByTestId('member-list')).toHaveAttribute('data-has-remove-member', 'yes');
    expect(screen.getByTestId('member-list')).toHaveAttribute('data-has-change-role', 'yes');

    expect(screen.getByTestId('invitation-manager')).toHaveAttribute('data-organization-id', 'org-1');
    expect(screen.getByTestId('invitation-manager')).toHaveAttribute('data-invitation-count', '1');
    expect(screen.getByTestId('invitation-manager')).toHaveAttribute(
      'data-has-cancel-invitation',
      'yes'
    );
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
  });

  it('member はメンバー一覧のみを表示し招待管理を描画しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-2',
      role: 'member',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'member',
      members: [
        {
          id: 'membership-2',
          userId: 'user-2',
          userName: 'Member User',
          displayName: 'Member User',
          role: 'member',
          joinedAt: new Date('2024-01-03T00:00:00Z'),
        },
      ],
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(screen.getByTestId('member-list')).toHaveAttribute('data-viewer-role', 'member');
    expect(screen.queryByTestId('invitation-manager')).not.toBeInTheDocument();
    expect(mockGetInvitationsAction).not.toHaveBeenCalled();
  });

  it('組織コンテキストを解決できない場合は notFound() を呼ぶこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'organization-not-found',
    });

    await expect(
      MembersPage({
        params: Promise.resolve({ orgSlug: 'missing-org' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invitation-manager')).not.toBeInTheDocument();
  });

  it('メンバー一覧を取得できない場合は 404 ではなくエラー表示を行うこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });

    mockListMembersForViewer.mockResolvedValueOnce({
      ok: false,
      reason: 'not-found',
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockGetInvitationsAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument();
    expect(
      screen.getByText('メンバー一覧を取得できませんでした。時間をおいて再読み込みしてください。')
    ).toBeInTheDocument();
  });

  it('メンバー一覧取得が system-failure の場合も 404 ではなくエラー表示を行うこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: false,
      reason: 'system-failure',
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockGetInvitationsAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument();
    expect(
      screen.getByText('メンバー一覧を取得できませんでした。時間をおいて再読み込みしてください。')
    ).toBeInTheDocument();
  });

  it('owner の招待取得に失敗した場合、InvitationManager を空一覧で表示しつつエラー通知すること', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });
    mockListMembersForViewer.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      viewerRole: 'owner',
      members: [
        {
          id: 'membership-1',
          userId: 'user-1',
          userName: 'Owner User',
          userEmail: 'owner@example.com',
          displayName: 'Owner User',
          role: 'owner',
          joinedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
    });
    mockGetInvitationsAction.mockResolvedValueOnce({
      ok: false,
      error: 'Failed to fetch invitations',
    });

    const page = await MembersPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(screen.getByTestId('member-list')).toBeInTheDocument();
    expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
    expect(screen.getByTestId('invitation-manager')).toHaveAttribute('data-invitation-count', '0');
    expect(
      screen.getByText('招待一覧を取得できませんでした。時間をおいて再読み込みしてください。')
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
