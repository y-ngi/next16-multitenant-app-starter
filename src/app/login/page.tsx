import { headers } from 'next/headers';
import { AuthForm } from '@/components/auth-form';
import { auth } from '@/lib/auth';
import { validateInvitationToken } from '@/lib/organization-lifecycle';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const rawEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  let verifiedEmail: string | undefined = rawEmail;
  let isEmailLocked = false;
  const isSignUpMode = mode === 'signup';
  let callbackURL: string | undefined = undefined;

  if (token) {
    const tokenResult = await validateInvitationToken(token);
    if (tokenResult.valid && tokenResult.invitation) {
      verifiedEmail = tokenResult.invitation.email;
      callbackURL = `/invitations/accept?token=${token}`;
      if (isSignUpMode) {
        isEmailLocked = true;
      }
    }
  }

  // /login に既存セッションを保持したまま到達した場合、新しいログイン/新規登録操作を
  // 古いセッションの上に積み重ねて進行させないよう、クライアント側で先にサインアウト
  // させる必要があるかどうかをここで判定して渡す。
  const session = await auth.api.getSession({ headers: await headers() });
  const hasExistingSession = !!session?.user;

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <AuthForm
        defaultEmail={verifiedEmail}
        isEmailLocked={isEmailLocked}
        defaultIsSignUp={isSignUpMode}
        callbackURL={callbackURL}
        hasExistingSession={hasExistingSession}
      />
    </main>
  );
}
