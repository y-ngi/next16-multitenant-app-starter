'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { getOrganizationMembersAction, getUserOrganizationsAction } from '@/app/actions/organization';
import { toast } from 'sonner';
import type {
  MemberMutationResult,
  OrganizationRole,
  ViewableMember,
} from '@/lib/organization-member-management';
import { MemberList } from './member-list';
import { InvitationManager } from './invitation-manager';
import { ChevronDown, ChevronUp, Users, Mail } from 'lucide-react';

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  joinedAt: Date;
}

export interface OrganizationListProps {
  refreshKey?: number;
}

interface ExpandedOrganization {
  showMembers: boolean;
  showInvitations: boolean;
}

interface OrganizationMemberListState {
  readonly members: readonly ViewableMember[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

const readOnlyMemberMutationResult: MemberMutationResult = {
  ok: false,
  reason: 'insufficient-role',
};

// Personal dashboard organization cards are informational only; management actions
// remain on the dedicated organization members/settings screens.
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

export function OrganizationList({ refreshKey }: OrganizationListProps) {
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [organizationMembers, setOrganizationMembers] = useState<
    Record<string, OrganizationMemberListState>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Record<string, ExpandedOrganization>>({});
  const requestIdRef = useRef<number>(0);
  const memberRequestIdRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const fetchOrganizations = async () => {
      // Increment request ID to track the latest request
      const currentRequestId = ++requestIdRef.current;
      
      setIsLoading(true);
      setError(null);

      try {
        const result = await getUserOrganizationsAction();

        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          if (result.ok && result.organizations) {
            setOrganizations(result.organizations as UserOrganization[]);
          } else {
            setError(result.error || '組織の取得に失敗しました');
            toast.error(result.error || '組織の取得に失敗しました');
          }
        }
      } catch (err) {
        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          const message = err instanceof Error ? err.message : '予期しないエラーが発生しました';
          setError(message);
          toast.error(message);
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchOrganizations();
  }, [refreshKey]);

  const loadOrganizationMembers = async (organizationId: string) => {
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
      const result = await getOrganizationMembersAction(organizationId);
      const members = result.members;

      if (currentRequestId !== memberRequestIdRef.current[organizationId]) {
        return;
      }

      if (result.ok && members) {
        setOrganizationMembers((prev) => ({
          ...prev,
          [organizationId]: {
            members: members.map((member) => ({
              id: member.id,
              userId: member.userId,
              userName: member.userName,
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

      const message = result.error || 'メンバーの取得に失敗しました';
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

  const toggleMemberList = (orgId: string) => {
    const shouldShowMembers = !expandedOrgs[orgId]?.showMembers;

    setExpandedOrgs((prev) => ({
      ...prev,
      [orgId]: {
        ...prev[orgId],
        showMembers: shouldShowMembers,
        showInvitations: false, // Close invitations when opening members
      },
    }));

    if (shouldShowMembers) {
      void loadOrganizationMembers(orgId);
    }
  };

  const toggleInvitations = (orgId: string) => {
    setExpandedOrgs((prev) => ({
      ...prev,
      [orgId]: {
        ...prev[orgId],
        showInvitations: !prev[orgId]?.showInvitations,
        showMembers: false, // Close members when opening invitations
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
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
          <Card className="hover:shadow-md transition-shadow">
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
                  onClick={() => toggleMemberList(org.id)}
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
                {org.role === 'owner' && (
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Member List Section */}
          {expandedOrgs[org.id]?.showMembers && (
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
          )}

          {/* Invitation Manager Section */}
          {expandedOrgs[org.id]?.showInvitations && org.role === 'owner' && (
            <Card className="border-green-100 bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">招待管理</CardTitle>
              </CardHeader>
              <CardContent>
                <InvitationManager organizationId={org.id} />
              </CardContent>
            </Card>
          )}
        </div>
      ))}
    </div>
  );
}
