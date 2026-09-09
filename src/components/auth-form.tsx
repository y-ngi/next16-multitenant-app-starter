'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient, twoFactor } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuthForm() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isEmailSentStep, setIsEmailSentStep] = useState(false); // メール確認案内画面フラグ
  const [isOtpStep, setIsOtpStep] = useState(false); // 2FAコード入力画面フラグ
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. 2FA (OTP) コード検証ステップ
    if (isOtpStep) {
      const res = await twoFactor.verifyOtp({
        code: otpCode,
      });

      if (res.error) {
        setError(res.error.message || '認証コードが正しくありません');
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
      return;
    }

    // 2. 新規登録処理 (ステップ1: 仮登録 & 検証メール送信)
    if (isSignUp) {
      const res = await authClient.signUp.email({
        email,
        password,
        name: displayName,
        callbackURL: '/login', // ← ここに callbackURL を追加！
      });

      if (res.error) {
        setError(res.error.message || '登録に失敗しました');
        setLoading(false);
        return;
      }

      // もし sendOnSignUp が自動発火しない環境の保険として、明示的に検証メール送信を呼び出すことも可能
      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/login',
      });

      // 新規登録成功後、メール案内画面を表示
      setIsEmailSentStep(true);
      setLoading(false);
    } else {
      // 3. ログイン処理 (ステップ2: ログイン & 2FA送信)
      const res = await authClient.signIn.email({
        email,
        password,
      });

      if (res.error) {
        if (res.error.message?.includes('not verified')) {
          setError('メールアドレスがまだ検証されていません。Mailpitを確認してください。');
        } else {
          setError(res.error.message || 'ログインに失敗しました');
        }
        setLoading(false);
        return;
      }

      // メール検証済みユーザーであれば 2FA チャレンジが発生する
      if (res.data && 'twoFactorRedirect' in res.data && res.data.twoFactorRedirect) {
        const otpRes = await twoFactor.sendOtp();
        if (otpRes.error) {
          setError('2FAコードの送信に失敗しました: ' + otpRes.error.message);
          setLoading(false);
          return;
        }

        setIsOtpStep(true);
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    }
  };

  // メール送信完了案内の UI
  if (isEmailSentStep) {
    return (
      <Card className="mx-auto w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>仮登録が完了しました</CardTitle>
          <CardDescription>ご入力いただいたメールアドレス（{email}）宛てに確認メールを送信しました。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Mailpit（
            <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-primary underline">
              http://localhost:8025
            </a>
            ）を開き、届いたメールの「メールアドレスを検証する」ボタンをクリックして登録を完了させてください。
          </p>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              setIsEmailSentStep(false);
              setIsSignUp(false);
            }}
          >
            ログイン画面へ移動
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{isOtpStep ? '2段階認証コードの入力' : isSignUp ? 'アカウント作成' : 'ログイン'}</CardTitle>
        <CardDescription>
          {isOtpStep
            ? 'メールアドレスに送信された 6 桁の 2FA 認証コードを入力してください'
            : isSignUp
              ? '必要な情報を入力してアカウントを作成してください'
              : '登録済みのメールアドレスとパスワードを入力してください'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && <div className="bg-destructive rounded-md p-3 text-sm text-white">{error}</div>}

          {isOtpStep ? (
            <div className="space-y-2">
              <Label htmlFor="otpCode">2FA 認証コード (6桁)</Label>
              <Input
                id="otpCode"
                type="text"
                placeholder="123456"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
              />
            </div>
          ) : (
            <>
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">表示名</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="山田 太郎"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required={isSignUp}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '処理中...' : isOtpStep ? '認証してログイン' : isSignUp ? 'アカウント作成' : 'ログイン'}
          </Button>

          {!isOtpStep && (
            <Button
              type="button"
              variant="link"
              className="text-sm"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
            >
              {isSignUp ? 'すでにアカウントをお持ちの方（ログイン）' : 'アカウントをお持ちでない方（新規登録）'}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
