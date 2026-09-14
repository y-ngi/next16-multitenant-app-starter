'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createInvitationAction } from '@/app/actions/organization';
import type {
  CancelInvitationResult,
  MemberManagementFailureReason,
} from '@/lib/organization-member-management';

export interface InvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly role?: string;
  readonly status: string;
  readonly inviteLink: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly mailSent?: boolean;
}

export interface InvitationManagerProps {
  readonly organizationId: string;
  readonly invitations: readonly InvitationRecord[];
  readonly onCancelInvitation?: (invitationId: string) => Promise<CancelInvitationResult>;
  readonly onInvitationCreated?: () => void;
}

function getInvitationMutationErrorMessage(reason: MemberManagementFailureReason): string {
  switch (reason) {
    case 'unauthenticated':
    case 'insufficient-role':
    case 'not-member':
      return '権限がありません';
    case 'invitation-not-pending':
    case 'not-found':
      return '対象の招待は既に処理済みか存在しません';
    default:
      return '操作が完了しませんでした。もう一度お試しください';
  }
}

function shouldRefreshAfterFailure(reason: MemberManagementFailureReason): boolean {
  return reason === 'invitation-not-pending' || reason === 'not-found';
}

export function InvitationManager({
  organizationId,
  invitations,
  onCancelInvitation,
  onInvitationCreated,
}: InvitationManagerProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleCreateInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error('メールアドレスを入力してください');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('有効なメールアドレスを入力してください');
      return;
    }

    setLoading(true);
    try {
      const result = await createInvitationAction(organizationId, trimmedEmail);

      if (!result.ok) {
        toast.error(result.error || 'Failed to create invitation');
        return;
      }

      toast.success('招待を送信しました');
      setEmail('');
      router.refresh();
      onInvitationCreated?.();

      if (result.mailSent === false) {
        toast.warning('メール送信に失敗しました。招待リンクを手動で共有してください');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create invitation';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvitation = async (invitation: InvitationRecord) => {
    if (!onCancelInvitation) {
      return;
    }

    if (!window.confirm(`「${invitation.email}」への招待を取り消しますか？`)) {
      return;
    }

    setPendingAction(`cancel:${invitation.id}`);

    try {
      const result = await onCancelInvitation(invitation.id);

      if (!result.ok) {
        toast.error(getInvitationMutationErrorMessage(result.reason));
        if (shouldRefreshAfterFailure(result.reason)) {
          router.refresh();
        }
        return;
      }

      router.refresh();
    } catch {
      toast.error('操作が完了しませんでした。もう一度お試しください');
    } finally {
      setPendingAction(null);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('招待リンクをコピーしました');
    } catch {
      toast.error('招待リンクのコピーに失敗しました');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'default';
      case 'accepted':
        return 'success';
      case 'rejected':
        return 'destructive';
      case 'expired':
      case 'canceled':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>メンバーを招待</CardTitle>
          <CardDescription>メールアドレスを入力して、新しいメンバーを組織へ招待します</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateInvitation} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="メールアドレスを入力"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? '送信中...' : '送信'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>招待履歴</CardTitle>
          <CardDescription>発行した招待の一覧と状態</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="text-sm text-muted-foreground">招待はまだありません</div>
          ) : (
            <div className="space-y-4">
              {invitations.map((invitation) => {
                const isPending = invitation.status === 'pending';
                const isCanceling = pendingAction === `cancel:${invitation.id}`;

                return (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{invitation.email}</span>
                        <Badge
                          variant={
                            getStatusBadgeColor(invitation.status) === 'success'
                              ? 'default'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {invitation.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(invitation.createdAt).toLocaleDateString('ja-JP')}
                      </div>

                      {invitation.mailSent === false ? (
                        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-600">
                          メール送信に失敗しました。招待リンクを手動で共有してください
                        </div>
                      ) : null}

                      {isPending ? (
                        <div className="mt-2 space-y-2">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">招待先限定リンク:</div>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 truncate rounded bg-muted p-2 text-xs">
                                {invitation.inviteLink}
                              </code>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopyLink(invitation.inviteLink)}
                              >
                                リンクをコピー
                              </Button>
                            </div>
                          </div>

                          {onCancelInvitation ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={pendingAction !== null}
                              onClick={() => handleCancelInvitation(invitation)}
                            >
                              {isCanceling ? '取り消し中...' : '招待を取り消す'}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
