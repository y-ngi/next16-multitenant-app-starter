'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Mail, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  getInvitationsAction,
  getUserOrganizationsAction,
} from '@/app/actions/organization';
import { listMembersForViewerAction } from '@/app/actions/organization-member-management';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  MemberManagementFailureReason,
  MemberMutationResult,
  OrganizationRole,
  ViewableMember,
} from '@/lib/organization-member-management';
import { InvitationManager, type InvitationRecord } from './invitation-manager';
import { MemberList } from './member-list';

export interface UserOrganization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: string;
  readonly joinedAt: Date;
}

export interface OrganizationListProps {
  readonly refreshKey?: number;
}

interface ExpandedOrganization {
  readonly showMembers: boolean;
  readonly showInvitations: boolean;
}

interface OrganizationMemberListState {
  readonly members: readonly ViewableMember[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface OrganizationInvitationListState {
  readonly invitations: readonly InvitationRecord[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

const readOnlyMemberMutationResult: MemberMutationResult = {
  ok: false,
  reason: 'insufficient-role',
};

async function handleReadOnlyRemoveMember(_targetUserId: string): Promise<MemberMutationResult> {
  void _targetUserId;
  return readOnlyMemberMutationResult;
}

async function handleReadOnlyChangeRole(
  _targetUserId: string,
  _newRole: OrganizationRole
): Promise<MemberMutationResult> {
  void _targetUserId;
  void _newRole;
  return readOnlyMemberMutationResult;
}

function getMemberListErrorMessage(reason: MemberManagementFailureReason): string {
  switch (reason) {
    case 'unauthenticated':
    case 'insufficient-role':
    case 'not-member':
      return '権限がありません';
    case 'organization-not-found':
      return '組織が見つかりません';
    default:
      return 'メンバーの取得に失敗しました';
  }
}

export function OrganizationList({ refreshKey }: OrganizationListProps) {
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [organizationMembers, setOrganizationMembers] = useState<
    Record<string, OrganizationMemberListState>
  >({});
  const [organizationInvitations, setOrganizationInvitations] = useState<
    Record<string, OrganizationInvitationListState>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Record<string, ExpandedOrganization>>({});
  const requestIdRef = useRef(0);
  const memberRequestIdRef = useRef<Record<string, number>>({});
  const invitationRequestIdRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const fetchOrganizations = async () => {
      const currentRequestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const result = await getUserOrganizationsAction();

        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        if (result.ok && result.organizations) {
          setOrganizations(result.organizations as UserOrganization[]);
          return;
        }

        const message = result.error || '組織の取得に失敗しました';
        setError(message);
        toast.error(message);
      } catch (err) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        const message = err instanceof Error ? err.message : '予期しないエラーが発生しました';
        setError(message);
        toast.error(message);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    void fetchOrganizations();
  }, [refreshKey]);

  const loadOrganizationMembers = async (organizationId: string, slug: string) => {
    const currentRequestId = (memberRequestIdRef.current[organizationId] ?? 0) + 1;
    memberRequestIdRef.current[organizationId] = currentRequestId;

    setOrganizationMembers((prev) => ({
      ...prev,
      [organizationId]: {
        members: prev[organizationId]?.members ?? [],
        isLoading: true,
        error: null,
      },
    }));

    try {
      const result = await listMembersForViewerAction(slug);

      if (currentRequestId !== memberRequestIdRef.current[organizationId]) {
        return;
      }

      if (result.ok) {
        setOrganizationMembers((prev) => ({
          ...prev,
          [organizationId]: {
            members: result.members.map((member) => ({
              id: member.id,
              userId: member.userId,
              userName: member.userName,
              ...(member.userEmail !== undefined ? { userEmail: member.userEmail } : {}),
              displayName: member.displayName,
              role: member.role,
              joinedAt: new Date(member.joinedAt),
            })),
            isLoading: false,
            error: null,
          },
        }));
        return;
      }

      const message = getMemberListErrorMessage(result.reason);
      setOrganizationMembers((prev) => ({
        ...prev,
        [organizationId]: {
          members: prev[organizationId]?.members ?? [],
          isLoading: false,
          error: message,
        },
      }));
      toast.error(message);
    } catch (err) {
      if (currentRequestId !== memberRequestIdRef.current[organizationId]) {
        return;
      }

      const message = err instanceof Error ? err.message : '予期しないエラーが発生しました';
      setOrganizationMembers((prev) => ({
        ...prev,
        [organizationId]: {
          members: prev[organizationId]?.members ?? [],
          isLoading: false,
          error: message,
        },
      }));
      toast.error(message);
    }
  };

  const loadOrganizationInvitations = async (organizationId: string) => {
    const currentRequestId = (invitationRequestIdRef.current[organizationId] ?? 0) + 1;
    invitationRequestIdRef.current[organizationId] = currentRequestId;

    setOrganizationInvitations((prev) => ({
      ...prev,
      [organizationId]: {
        invitations: prev[organizationId]?.invitations ?? [],
        isLoading: true,
        error: null,
      },
    }));

    try {
      const result = await getInvitationsAction(organizationId);
      const invitations = result.invitations;

      if (currentRequestId !== invitationRequestIdRef.current[organizationId]) {
        return;
      }

      if (result.ok && invitations) {
        setOrganizationInvitations((prev) => ({
          ...prev,
          [organizationId]: {
            invitations: invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              status: invitation.status,
              inviteLink: invitation.inviteLink,
              createdAt: new Date(invitation.createdAt),
              expiresAt: new Date(invitation.expiresAt),
            })),
            isLoading: false,
            error: null,
          },
        }));
        return;
      }

      const message = result.error || '招待一覧の取得に失敗しました';
      setOrganizationInvitations((prev) => ({
        ...prev,
        [organizationId]: {
          invitations: prev[organizationId]?.invitations ?? [],
          isLoading: false,
          error: message,
        },
      }));
      toast.error(message);
    } catch (err) {
      if (currentRequestId !== invitationRequestIdRef.current[organizationId]) {
        return;
      }

      const message = err instanceof Error ? err.message : '予期しないエラーが発生しました';
      setOrganizationInvitations((prev) => ({
        ...prev,
        [organizationId]: {
          invitations: prev[organizationId]?.invitations ?? [],
          isLoading: false,
          error: message,
        },
      }));
      toast.error(message);
    }
  };

  const toggleMemberList = (orgId: string, slug: string) => {
    const shouldShowMembers = !expandedOrgs[orgId]?.showMembers;

    setExpandedOrgs((prev) => ({
      ...prev,
      [orgId]: {
        ...prev[orgId],
        showMembers: shouldShowMembers,
        showInvitations: false,
      },
    }));

    if (shouldShowMembers) {
      void loadOrganizationMembers(orgId, slug);
    }
  };

  const toggleInvitations = (orgId: string) => {
    const shouldShowInvitations = !expandedOrgs[orgId]?.showInvitations;

    setExpandedOrgs((prev) => ({
      ...prev,
      [orgId]: {
        ...prev[orgId],
        showInvitations: shouldShowInvitations,
        showMembers: false,
      },
    }));

    if (shouldShowInvitations) {
      void loadOrganizationInvitations(orgId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-sm text-red-700">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            所属している組織がありません。新しい組織を作成するか、既存の組織からの招待をお待ちください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {organizations.map((org) => (
        <div key={org.id} className="space-y-2">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{org.name}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {org.slug}
                  </CardDescription>
                </div>
                <Badge variant={org.role === 'owner' ? 'default' : 'secondary'}>
                  {org.role === 'owner' ? 'オーナー' : 'メンバー'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {new Date(org.joinedAt).toLocaleDateString('ja-JP')} に参加
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/org/${org.slug}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-2' })}
                >
                  組織を開く
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleMemberList(org.id, org.slug)}
                  className="gap-2"
                  data-testid={`member-list-toggle-${org.id}`}
                >
                  <Users className="h-4 w-4" />
                  {expandedOrgs[org.id]?.showMembers ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      メンバー一覧を閉じる
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      メンバー一覧
                    </>
                  )}
                </Button>
                {org.role === 'owner' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleInvitations(org.id)}
                    className="gap-2"
                    data-testid={`invitation-toggle-${org.id}`}
                  >
                    <Mail className="h-4 w-4" />
                    {expandedOrgs[org.id]?.showInvitations ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        招待管理を閉じる
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        招待管理
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {expandedOrgs[org.id]?.showMembers ? (
            <Card className="border-blue-100 bg-blue-50" data-testid={`member-list-${org.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">メンバー一覧</CardTitle>
              </CardHeader>
              <CardContent>
                {organizationMembers[org.id]?.isLoading || !organizationMembers[org.id] ? (
                  <div className="space-y-2">
                    <Skeleton className="h-20 rounded-lg" />
                    <Skeleton className="h-20 rounded-lg" />
                  </div>
                ) : organizationMembers[org.id]?.error ? (
                  <p className="text-sm text-red-700">{organizationMembers[org.id]?.error}</p>
                ) : (
                  <MemberList
                    members={organizationMembers[org.id]?.members ?? []}
                    viewerRole="member"
                    viewerUserId=""
                    onRemoveMember={handleReadOnlyRemoveMember}
                    onChangeRole={handleReadOnlyChangeRole}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}

          {expandedOrgs[org.id]?.showInvitations && org.role === 'owner' ? (
            <Card className="border-green-100 bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">招待管理</CardTitle>
              </CardHeader>
              <CardContent>
                {organizationInvitations[org.id]?.isLoading || !organizationInvitations[org.id] ? (
                  <div className="space-y-2">
                    <Skeleton className="h-20 rounded-lg" />
                    <Skeleton className="h-20 rounded-lg" />
                  </div>
                ) : organizationInvitations[org.id]?.error ? (
                  <p className="text-sm text-red-700">{organizationInvitations[org.id]?.error}</p>
                ) : (
                  <InvitationManager
                    organizationId={org.id}
                    invitations={organizationInvitations[org.id]?.invitations ?? []}
                    onInvitationCreated={() => {
                      void loadOrganizationInvitations(org.id);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ))}
    </div>
  );
}
