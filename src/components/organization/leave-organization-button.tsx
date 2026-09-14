'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type {
  LeaveOrganizationResult,
  MemberManagementFailureReason,
} from '@/lib/organization-member-management';

export interface LeaveOrganizationButtonProps {
  readonly organizationSlug: string;
  readonly onLeaveOrganization: (organizationSlug: string) => Promise<LeaveOrganizationResult>;
}

function getLeaveOrganizationErrorMessage(reason: MemberManagementFailureReason): string {
  switch (reason) {
    case 'last-owner-protection':
      return '別のメンバーを owner に変更する必要があります';
    case 'unauthenticated':
    case 'not-member':
    case 'insufficient-role':
      return '権限がありません';
    default:
      return '操作が完了しませんでした。もう一度お試しください';
  }
}

export function LeaveOrganizationButton({
  organizationSlug,
  onLeaveOrganization,
}: LeaveOrganizationButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLeaveOrganization = async () => {
    if (!window.confirm('この組織から脱退しますか？')) {
      return;
    }

    setIsPending(true);

    try {
      const result = await onLeaveOrganization(organizationSlug);

      if (!result.ok) {
        toast.error(getLeaveOrganizationErrorMessage(result.reason));
        return;
      }

      router.push('/dashboard/personal/organizations');
    } catch {
      toast.error('操作が完了しませんでした。もう一度お試しください');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={isPending}
      onClick={handleLeaveOrganization}
    >
      {isPending ? '脱退中...' : '組織から脱退する'}
    </Button>
  );
}
