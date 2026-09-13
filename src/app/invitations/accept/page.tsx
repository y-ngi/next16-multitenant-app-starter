import { Suspense } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { validateInvitationTokenAction } from '@/app/actions/organization';
import { checkEmailHasAccount } from '@/lib/organization-lifecycle';
import { InvitationAcceptCard } from '@/components/organization/invitation-accept-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function InvitationAcceptContent({ token }: { readonly token: string | null }) {
  if (!token) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-red-600">エラー</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200 bg-red-50 mb-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-sm text-red-800">
              招待が見つかりません
            </AlertDescription>
          </Alert>
          <Link href="/dashboard/personal">
            <Button className="w-full">ダッシュボードに戻る</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Validate invitation token
  const validationResult = await validateInvitationTokenAction(token);

  if (!validationResult.valid) {
    const reasonMessages: Record<string, string> = {
      'not-found': '招待が見つかりません',
      'expired': 'この招待は有効期限が切れています',
      'already-used': 'この招待は既に使用されています',
      'canceled': 'この招待は取り消されています',
    };

    const message = reasonMessages[validationResult.reason || 'not-found'] || '招待が見つかりません';

    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-red-600">エラー</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200 bg-red-50 mb-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-sm text-red-800">
              {message}
            </AlertDescription>
          </Alert>
          <Link href="/dashboard/personal">
            <Button className="w-full">ダッシュボードに戻る</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Invitation is valid, get session
  const headersData = await headers();
  const session = await auth.api.getSession({ headers: headersData });

  const isLoggedIn = !!session?.user;
  const currentUserEmail = session?.user?.email || null;

  // Whether the invited email already has a registered account. Used to
  // decide which single CTA (login vs signup) to route the invitee to.
  const inviteeHasAccount = await checkEmailHasAccount(validationResult.invitation!.email);

  return (
    <InvitationAcceptCard
      token={token}
      invitation={validationResult.invitation!}
      isLoggedIn={isLoggedIn}
      currentUserEmail={currentUserEmail}
      inviteeHasAccount={inviteeHasAccount}
    />
  );
}

export default async function InvitationAcceptPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p>読み込み中...</p>
            </div>
          </div>
        }
      >
        <InvitationAcceptContent token={token || null} />
      </Suspense>
    </div>
  );
}
