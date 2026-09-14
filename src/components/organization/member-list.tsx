'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  MemberManagementFailureReason,
  MemberMutationResult,
  OrganizationRole,
  ViewableMember,
} from '@/lib/organization-member-management';

export interface MemberListProps {
  readonly members: readonly ViewableMember[];
  readonly viewerRole: OrganizationRole;
  readonly viewerUserId: string;
  readonly onRemoveMember: (targetUserId: string) => Promise<MemberMutationResult>;
  readonly onChangeRole: (
    targetUserId: string,
    newRole: OrganizationRole
  ) => Promise<MemberMutationResult>;
}

function getMemberMutationErrorMessage(reason: MemberManagementFailureReason): string {
  switch (reason) {
    case 'last-owner-protection':
      return '少なくとも1人の owner が必要です。別のメンバーを owner に変更してください';
    case 'unauthenticated':
    case 'insufficient-role':
    case 'not-member':
      return '権限がありません';
    default:
      return '操作が完了しませんでした。もう一度お試しください';
  }
}

export function MemberList({
  members,
  viewerRole,
  viewerUserId,
  onRemoveMember,
  onChangeRole,
}: MemberListProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const canManageMembers = viewerRole === 'owner';

  const handleRemoveMember = async (member: ViewableMember) => {
    if (!window.confirm(`「${member.displayName || member.userName}」を削除しますか？`)) {
      return;
    }

    setPendingAction(`remove:${member.userId}`);

    try {
      const result = await onRemoveMember(member.userId);

      if (!result.ok) {
        toast.error(getMemberMutationErrorMessage(result.reason));
        return;
      }

      router.refresh();
    } catch {
      toast.error('操作が完了しませんでした。もう一度お試しください');
    } finally {
      setPendingAction(null);
    }
  };

  const handleChangeRole = async (member: ViewableMember, newRole: OrganizationRole) => {
    const roleLabel = newRole === 'owner' ? 'owner' : 'member';

    if (!window.confirm(`「${member.displayName || member.userName}」を ${roleLabel} に変更しますか？`)) {
      return;
    }

    setPendingAction(`role:${member.userId}:${newRole}`);

    try {
      const result = await onChangeRole(member.userId, newRole);

      if (!result.ok) {
        toast.error(getMemberMutationErrorMessage(result.reason));
        return;
      }

      router.refresh();
    } catch {
      toast.error('操作が完了しませんでした。もう一度お試しください');
    } finally {
      setPendingAction(null);
    }
  };

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            メンバーがいません。メンバーを招待してください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {members.map((member) => {
        const isViewerRow = member.userId === viewerUserId;
        const nextRole: OrganizationRole = member.role === 'owner' ? 'member' : 'owner';
        const roleChangeLabel = nextRole === 'owner' ? 'owner に変更' : 'member に変更';
        const isRemoving = pendingAction === `remove:${member.userId}`;
        const isChangingRole = pendingAction === `role:${member.userId}:${nextRole}`;

        return (
          <Card key={member.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="gap-3 pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-lg">{member.displayName || member.userName}</CardTitle>
                  {member.userEmail ? (
                    <CardDescription className="break-all text-xs text-muted-foreground">
                      {member.userEmail}
                    </CardDescription>
                  ) : null}
                </div>
                <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                  {member.role === 'owner' ? 'オーナー' : 'メンバー'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {new Date(member.joinedAt).toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                に参加
              </p>

              {canManageMembers && !isViewerRow ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendingAction !== null}
                    onClick={() => handleChangeRole(member, nextRole)}
                  >
                    {isChangingRole ? '変更中...' : roleChangeLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pendingAction !== null}
                    onClick={() => handleRemoveMember(member)}
                  >
                    {isRemoving ? '削除中...' : '削除'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
