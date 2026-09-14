'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  DeleteOrganizationResult,
  MemberManagementFailureReason,
  MemberMutationResult,
} from '@/lib/organization-member-management';

export interface OrganizationDangerZoneProps {
  readonly organizationSlug: string;
  readonly currentUserId: string;
  readonly onChangeOwnRole: (
    organizationSlug: string,
    userId: string,
    newRole: 'member'
  ) => Promise<MemberMutationResult>;
  readonly onDeleteOrganization: (
    organizationSlug: string
  ) => Promise<DeleteOrganizationResult>;
}

function getSelfDemotionErrorMessage(reason: MemberManagementFailureReason): string {
  switch (reason) {
    case 'last-owner-protection':
      return '少なくとも1人の owner が必要です。別のメンバーを owner に変更してください';
    case 'unauthenticated':
    case 'not-member':
    case 'insufficient-role':
      return '権限がありません';
    default:
      return '操作が完了しませんでした。もう一度お試しください';
  }
}

function getDeleteOrganizationErrorMessage(): string {
  return '削除できませんでした。もう一度お試しください';
}

export function OrganizationDangerZone({
  organizationSlug,
  currentUserId,
  onChangeOwnRole,
  onDeleteOrganization,
}: OrganizationDangerZoneProps) {
  const router = useRouter();
  const [isChangingOwnRole, setIsChangingOwnRole] = useState(false);
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);

  const handleChangeOwnRole = async () => {
    if (!window.confirm('自分を member に変更しますか？')) {
      return;
    }

    setIsChangingOwnRole(true);

    try {
      const result = await onChangeOwnRole(organizationSlug, currentUserId, 'member');

      if (!result.ok) {
        toast.error(getSelfDemotionErrorMessage(result.reason));
        return;
      }

      toast.success('自分のロールを member に変更しました');
      router.refresh();
    } catch {
      toast.error('操作が完了しませんでした。もう一度お試しください');
    } finally {
      setIsChangingOwnRole(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!window.confirm('この組織を削除しますか？この操作は元に戻せません。')) {
      return;
    }

    setIsDeletingOrganization(true);

    try {
      const result = await onDeleteOrganization(organizationSlug);

      if (!result.ok) {
        toast.error(getDeleteOrganizationErrorMessage());
        return;
      }

      router.push('/dashboard/personal/organizations');
    } catch {
      toast.error(getDeleteOrganizationErrorMessage());
    } finally {
      setIsDeletingOrganization(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">危険な操作</CardTitle>
        <CardDescription>
          owner の権限変更や組織削除は、メンバー管理と組織の利用に大きく影響します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3 border-b border-border pb-6 last:border-b-0 last:pb-0">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">自分を member に変更</h3>
            <p className="text-sm text-muted-foreground">
              別の owner がいる場合のみ、自分のロールを member に変更できます。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isChangingOwnRole || isDeletingOrganization}
            onClick={handleChangeOwnRole}
          >
            {isChangingOwnRole ? '変更中...' : '自分をmemberに変更'}
          </Button>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-destructive">組織を削除</h3>
            <p className="text-sm text-muted-foreground">
              組織、所属情報、未受諾の招待が削除されます。この操作は元に戻せません。
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={isChangingOwnRole || isDeletingOrganization}
            onClick={handleDeleteOrganization}
          >
            {isDeletingOrganization ? '削除中...' : '組織を削除'}
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
