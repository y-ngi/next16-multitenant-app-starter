'use client';

import { useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { respondToInvitationAction } from '@/app/actions/organization';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export interface InvitationDetails {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly email: string;
  readonly role: 'owner' | 'member';
}

interface InvitationAcceptCardProps {
  readonly token: string;
  readonly invitation: InvitationDetails;
  readonly isLoggedIn: boolean;
  readonly currentUserEmail: string | null;
  readonly inviteeHasAccount: boolean;
  readonly onSuccess?: () => void;
}

export function InvitationAcceptCard({
  token,
  invitation,
  isLoggedIn,
  currentUserEmail,
  inviteeHasAccount,
  onSuccess,
}: InvitationAcceptCardProps): ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Check if email mismatch (Req 4.4)
  const isEmailMismatch = isLoggedIn && currentUserEmail !== invitation.email;

  // Handle acceptance
  const handleAccept = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await respondToInvitationAction(token, true);

      if (!result.ok) {
        setError(result.error || 'Failed to accept invitation');
        setIsLoading(false);
        return;
      }

      // Show success toast
      toast({
        title: 'Success',
        description: `You've joined ${invitation.organizationName}!`,
      });

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  // Handle rejection
  const handleReject = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await respondToInvitationAction(token, false);

      if (!result.ok) {
        setError(result.error || 'Failed to reject invitation');
        setIsLoading(false);
        return;
      }

      setRejected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  // Handle re-login: sign out of the current (mismatched) account, then
  // redirect straight to the invited email's login/signup flow.
  const handleReLogin = async () => {
    setIsLoading(true);
    const reLoginPath = inviteeHasAccount
      ? `/login?email=${encodeURIComponent(invitation.email)}&token=${token}`
      : `/login?email=${encodeURIComponent(invitation.email)}&mode=signup&token=${token}`;

    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push(reLoginPath);
          router.refresh();
        },
        onError: () => {
          setIsLoading(false);
          setError('ログアウトに失敗しました');
        },
      },
    });
  };

  // Show email mismatch warning
  if (isEmailMismatch) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-red-600">アカウント不一致</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm text-yellow-800">
              現在ログインされている会員への招待ではありません。招待を受けたメールアドレスで再ログインしてください。
            </AlertDescription>
          </Alert>

          <Button onClick={handleReLogin} disabled={isLoading} className="w-full">
            {isLoading ? '処理中...' : '再ログイン'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show unauthenticated state
  if (!isLoggedIn) {
    const authLink = inviteeHasAccount
      ? `/login?email=${encodeURIComponent(invitation.email)}&token=${token}`
      : `/login?email=${encodeURIComponent(invitation.email)}&mode=signup&token=${token}`;

    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>招待を受け入れる</CardTitle>
          <CardDescription>{invitation.organizationName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-gray-600">招待メールアドレス:</p>
            <p className="font-medium text-gray-900">{invitation.email}</p>
          </div>

          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              {inviteeHasAccount
                ? '招待されたメールアドレスでログインして、招待を受け入れてください。'
                : '招待されたメールアドレスで新規登録して、招待を受け入れてください。'}
            </AlertDescription>
          </Alert>

          <Link href={authLink} className="w-full block">
            <Button className="w-full">{inviteeHasAccount ? 'ログイン' : '新規登録'}</Button>
          </Link>

          <p className="text-xs text-gray-500 text-center">
            招待を受けたメールアドレス以外では、組織に参加できません。
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show rejection confirmation
  if (rejected) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-green-600">招待を拒否しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-800">
              {invitation.organizationName}への招待を拒否しました。
            </AlertDescription>
          </Alert>

          <Link href="/dashboard" className="w-full">
            <Button className="w-full">ダッシュボードに戻る</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Show acceptance form for logged-in user with matching email
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>招待を受け入れる</CardTitle>
        <CardDescription>{invitation.organizationName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-sm text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm font-medium text-gray-600 mb-2">組織名</p>
          <p className="text-lg font-semibold text-gray-900">{invitation.organizationName}</p>
          <p className="text-xs text-gray-500 mt-2">このメールアドレスが招待されています: {invitation.email}</p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            disabled={isLoading}
            className="flex-1"
            size="lg"
          >
            {isLoading ? '処理中...' : '承諾する'}
          </Button>
          <Button
            onClick={handleReject}
            disabled={isLoading}
            variant="outline"
            className="flex-1"
            size="lg"
          >
            {isLoading ? '処理中...' : '拒否する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
