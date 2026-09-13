import { AuthForm } from '@/components/auth-form';
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

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <AuthForm
        defaultEmail={verifiedEmail}
        isEmailLocked={isEmailLocked}
        defaultIsSignUp={isSignUpMode}
        callbackURL={callbackURL}
      />
    </main>
  );
}
