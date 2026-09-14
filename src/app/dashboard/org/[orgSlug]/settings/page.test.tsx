import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './page';

interface MockLeaveOrganizationButtonProps {
  readonly organizationSlug: string;
  readonly onLeaveOrganization: (organizationSlug: string) => Promise<unknown>;
}

interface MockOrganizationDangerZoneProps {
  readonly organizationSlug: string;
  readonly currentUserId: string;
  readonly onChangeOwnRole: (
    organizationSlug: string,
    userId: string,
    newRole: 'member'
  ) => Promise<unknown>;
  readonly onDeleteOrganization: (organizationSlug: string) => Promise<unknown>;
}

const leaveOrganizationActionMock = vi.hoisted(() => vi.fn());
const changeMemberRoleActionMock = vi.hoisted(() => vi.fn());
const deleteOrganizationActionMock = vi.hoisted(() => vi.fn());

const leaveOrganizationButtonMock = vi.hoisted(() =>
  vi.fn(({ organizationSlug }: MockLeaveOrganizationButtonProps) => (
    <div data-testid="leave-organization-button" data-organization-slug={organizationSlug} />
  ))
);

const organizationDangerZoneMock = vi.hoisted(() =>
  vi.fn(({ organizationSlug, currentUserId }: MockOrganizationDangerZoneProps) => (
    <div
      data-testid="organization-danger-zone"
      data-organization-slug={organizationSlug}
      data-current-user-id={currentUserId}
    />
  ))
);

const mockHeaders = vi.fn();
const mockResolveOrgContext = vi.fn();
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

vi.mock('@/app/actions/organization-member-management', () => ({
  leaveOrganizationAction: leaveOrganizationActionMock,
  changeMemberRoleAction: changeMemberRoleActionMock,
  deleteOrganizationAction: deleteOrganizationActionMock,
}));

vi.mock('@/components/organization/leave-organization-button', () => ({
  LeaveOrganizationButton: leaveOrganizationButtonMock,
}));

vi.mock('@/components/organization/organization-danger-zone', () => ({
  OrganizationDangerZone: organizationDangerZoneMock,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    leaveOrganizationButtonMock.mockClear();
    organizationDangerZoneMock.mockClear();
    headersData = new Headers();
    mockHeaders.mockResolvedValue(headersData);
  });

  it('member は自己脱退ボタンのみを表示し owner 専用の危険な操作を描画しないこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-2',
      role: 'member',
    });

    const page = await SettingsPage({
      params: Promise.resolve({ orgSlug: 'AcMe' }),
    });

    render(page);

    expect(mockResolveOrgContext).toHaveBeenCalledWith(headersData, 'AcMe');
    expect(screen.getByTestId('leave-organization-button')).toHaveAttribute(
      'data-organization-slug',
      'acme'
    );
    expect(screen.queryByTestId('organization-danger-zone')).not.toBeInTheDocument();
  });

  it('owner は自己脱退ボタンと危険な操作セクションの両方を表示すること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });

    const page = await SettingsPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    expect(screen.getByTestId('leave-organization-button')).toHaveAttribute(
      'data-organization-slug',
      'acme'
    );
    expect(screen.getByTestId('organization-danger-zone')).toHaveAttribute(
      'data-organization-slug',
      'acme'
    );
    expect(screen.getByTestId('organization-danger-zone')).toHaveAttribute(
      'data-current-user-id',
      'user-1'
    );
  });

  it('組織コンテキストを解決できない場合は notFound() を呼ぶこと', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: false,
      reason: 'organization-not-found',
    });

    await expect(
      SettingsPage({
        params: Promise.resolve({ orgSlug: 'missing-org' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('leave-organization-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-danger-zone')).not.toBeInTheDocument();
  });

  it('Server Action を各コンポーネントへそのまま配線すること', async () => {
    mockResolveOrgContext.mockResolvedValueOnce({
      ok: true,
      organizationId: 'org-1',
      organizationName: 'Acme Inc.',
      organizationSlug: 'acme',
      userId: 'user-1',
      role: 'owner',
    });

    const page = await SettingsPage({
      params: Promise.resolve({ orgSlug: 'acme' }),
    });

    render(page);

    const leaveOrganizationProps = leaveOrganizationButtonMock.mock.calls[0]?.[0] as
      | MockLeaveOrganizationButtonProps
      | undefined;
    const dangerZoneProps = organizationDangerZoneMock.mock.calls[0]?.[0] as
      | MockOrganizationDangerZoneProps
      | undefined;

    expect(leaveOrganizationProps?.onLeaveOrganization).toBe(leaveOrganizationActionMock);
    expect(dangerZoneProps?.onChangeOwnRole).toBe(changeMemberRoleActionMock);
    expect(dangerZoneProps?.onDeleteOrganization).toBe(deleteOrganizationActionMock);
  });
});
