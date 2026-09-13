'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createInvitationAction, getInvitationsAction } from '@/app/actions/organization';

export interface InvitationRecord {
  id: string;
  email: string;
  role?: string;
  status: string;
  inviteLink: string;
  createdAt: Date;
  expiresAt: Date;
  mailSent?: boolean;
}

interface InvitationManagerProps {
  organizationId: string;
}

export function InvitationManager({ organizationId }: InvitationManagerProps) {
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load invitations on mount
  useEffect(() => {
    loadInvitations();
  }, [organizationId]);

  const loadInvitations = async () => {
    setFetching(true);
    setError(null);
    try {
      const result = await getInvitationsAction(organizationId);
      if (!result.ok) {
        setError(result.error || 'Failed to load invitations');
        setInvitations([]);
      } else {
        setInvitations(result.invitations || []);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load invitations';
      setError(errorMessage);
      setInvitations([]);
    } finally {
      setFetching(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('メールアドレスを入力してください');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('有効なメールアドレスを入力してください');
      return;
    }

    setLoading(true);
    try {
      const result = await createInvitationAction(organizationId, email.trim());

      if (!result.ok) {
        toast.error(result.error || 'Failed to create invitation');
      } else {
        toast.success('招待を送信しました');
        setEmail('');
        // Add the new invitation with mailSent flag
        const newInvitation: InvitationRecord = {
          id: result.invitation!.id,
          email: result.invitation!.email,
          role: 'member',  // Default role for newly created invitations
          status: result.invitation!.status,
          inviteLink: result.invitation!.inviteLink,
          expiresAt: result.invitation!.expiresAt,
          createdAt: result.invitation!.createdAt,
          mailSent: result.mailSent,
        };
        setInvitations((prev) => [newInvitation, ...prev]);

        // If mail sending failed, show a warning
        if (result.mailSent === false) {
          toast.warning('メール送信に失敗しました。招待リンクを手動で共有してください');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create invitation';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
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
        return 'secondary';
      case 'canceled':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (error && invitations.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>メンバーを招待</CardTitle>
          <CardDescription>組織へメンバーを招待します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invitation Form */}
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
                onChange={(e) => setEmail(e.target.value)}
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

      {/* Invitations List */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>招待履歴</CardTitle>
          <CardDescription>発行した招待の一覧と状態</CardDescription>
        </CardHeader>
        <CardContent>
          {fetching ? (
            <div className="text-sm text-muted-foreground">読み込み中...</div>
          ) : invitations.length === 0 ? (
            <div className="text-sm text-muted-foreground">招待はまだありません</div>
          ) : (
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{invitation.email}</span>
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

                    {/* Show warning if email sending failed */}
                    {invitation.mailSent === false && (
                      <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                        メール送信に失敗しました。招待リンクを手動で共有してください
                      </div>
                    )}

                    {/* Show invite link for pending invitations */}
                    {invitation.status === 'pending' && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-muted-foreground">招待先限定リンク:</div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted p-2 rounded flex-1 truncate">
                            {invitation.inviteLink}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyLink(invitation.inviteLink)}
                          >
                            リンクをコピー
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
