# ② 2FA (メールOTP) & Mailpit 連携手順書 (完全2ステップ版)

本手順書では、
- **新規登録時のメールアドレス所有確認（メールリンク検証）** 
- **ログイン時の 2FA (メール OTP) チャレンジ** 

上記 2 ステップで厳密に運用する手順および Mailpit 連携方法を解説します。

---

## 1. パッケージの追加インストール

メール送信ライブラリ `nodemailer` を追加します。

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer

```

---

## 2. 環境変数の設定追記

Mailpit の SMTP 接続情報を `.env.example` & `.env.local` に追加します。

`.env.example` & `.env.local`

```env
# Mailpit SMTP 設定 (Dockerコンテナ接続時は mailpit / ローカル直接接続時は localhost)
SMTP_HOST="mailpit"
SMTP_PORT=1025

```

---

## 3. Drizzle スキーマの更新 (`src/db/schema.ts`)

`user` テーブルへ 2FA 有効化フラグ（`twoFactorEnabled`）を追加し、2FA 管理用の `twoFactor` テーブルおよび関連カラムを定義します。

`src/db/schema.ts`

```typescript
import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

// ==========================================
// 1. Better Auth 認証基盤テーブル
// ==========================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled"), // 2FAフラグを追加
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ==========================================
// 2. 2FA (Two-Factor) 管理テーブル
// ==========================================

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  published: boolean("published").notNull().default(false),
  verified: boolean("verified"),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until"),
});

```

---

## 4. `src/lib/auth.ts` の更新（メール検証 ＋ 常時 2FA）

`databaseHooks` で全新規ユーザーに `twoFactorEnabled: true` を自動設定します。
また、`requireEmailVerification: true` を設定して**未検証ユーザーのログインを完全にブロック**し、専用の検証メール送信処理（ログ出力付き）を実装します。

`src/lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { db } from "@/db";
import * as schema from "@/db/schema";

// Mailpit 接続用 SMTP トランスポーター
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // メール未検証ユーザーのログインをブロック
  },
  emailVerification: {
    sendOnSignUp: true, // 新規登録時に自動で検証メールを送信
    autoSignInAfterVerification: false,
    async sendVerificationEmail({ user, url }) {
      console.log(`[Email Verification] 送信試行先: ${user.email}`);
      console.log(`[Email Verification] 生成URL: ${url}`);
      try {
        await transporter.sendMail({
          from: '"認証システム" <noreply@example.com>',
          to: user.email,
          subject: "【メールアドレスの確認】アカウント登録手続き",
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>メールアドレスの所有確認</h2>
              <p>${user.name} 様</p>
              <p>アカウントの作成を完了するため、以下のボタンをクリックしてメールアドレスを認証してください。</p>
              <p style="margin: 20px 0;">
                <a href="${url}" style="padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">
                  メールアドレスを検証する
                </a>
              </p>
            </div>
          `,
        });
      } catch (error) {
        console.error(`[Email Verification] メール送信失敗:`, error);
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        // 全ユーザーにログイン時の 2FA を必須化
        async before(user) {
          return { data: { ...user, twoFactorEnabled: true } };
        },
      },
    },
  },
  plugins: [
    twoFactor({
      otpOptions: {
        async sendOTP({ user, otp }) {
          await transporter.sendMail({
            from: '"認証システム" <noreply@example.com>',
            to: user.email,
            subject: "【ログイン認証コード】2段階認証のご案内",
            text: `あなたの認証コードは ${otp} です。`,
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>2段階認証コードのご案内</h2>
                <p>以下の認証コードを画面に入力してください。</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #2563eb;">
                  ${otp}
                </p>
                <p style="font-size: 12px; color: #666;">※このコードに心当たりがない場合は無視してください。</p>
              </div>
            `,
          });
        },
      },
    }),
  ],
});

```

---

## 5. `src/lib/auth-client.ts` の更新

クライアント側で 2FA 操作を行うため `twoFactorClient` プラグインを登録します。

※ `twoFactorPage` オプションを指定すると不要なページリロードが発生して React 状態（`isOtpStep`）がリセットされるため、無効化します。

`src/lib/auth-client.ts`

```typescript
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [
    twoFactorClient(),
  ],
});

export const { useSession, signIn, signUp, signOut, twoFactor } = authClient;

```

---

## 6. データベースへの反映

`two_factor` テーブルと `user.twoFactorEnabled` カラムをデータベースに同期します。

```bash
pnpm db:push

```

---

## 7. 2FA ＆ メール検証対応認証フォームの実装 (`src/components/auth-form.tsx`)

* 新規登録処理（`signUp`）では、検証リンク生成に必要な **`callbackURL: "/login"`** を必ず渡します。
* 登録後は「仮登録完了」の案内画面（`isEmailSentStep`）を表示します。
* ログイン処理（`signIn`）では、未検証エラーをハンドリングし、検証済みの場合は 2FA 画面（`isOtpStep`）へ移行させます。

`src/components/auth-form.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, twoFactor } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isEmailSentStep, setIsEmailSentStep] = useState(false); // 仮登録（メール送信済み）画面フラグ
  const [isOtpStep, setIsOtpStep] = useState(false); // 2FAコード入力画面フラグ
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

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
        setError(res.error.message || "認証コードが正しくありません");
        setLoading(false);
      } else {
        router.push("/dashboard");
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
        callbackURL: "/login", // 検証メールのリンク生成に必須
      });

      // エラーハンドリング（公式 Enumeration 対策により、既存ユーザー再登録時はエラーになりません）
      if (res.error) {
        setError(res.error.message || "登録に失敗しました");
        setLoading(false);
        return;
      }

      // 新規登録成功後、メール案内画面を表示して処理を止める
      setIsEmailSentStep(true);
      setLoading(false);
    } else {
      // 3. ログイン処理 (ステップ2: ログイン & 2FA送信)
      const res = await authClient.signIn.email({
        email,
        password,
      });

      if (res.error) {
        // 未検証ユーザーの場合は専用のエラーメッセージを表示
        if (res.error.message?.includes("not verified")) {
          setError("メールアドレスが未検証です。Mailpitに届いた確認メールのリンクをクリックしてください。");
        } else {
          setError(res.error.message || "ログインに失敗しました");
        }
        setLoading(false);
        return;
      }

      // 2FA チャレンジが発生した場合、OTP コードを発行・送信して検証画面へ移行
      if (res.data && "twoFactorRedirect" in res.data && res.data.twoFactorRedirect) {
        const otpRes = await twoFactor.sendOtp();
        if (otpRes.error) {
          setError("認証コードの送信に失敗しました: " + otpRes.error.message);
          setLoading(false);
          return;
        }

        setIsOtpStep(true);
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    }
  };

  // メール送信完了案内の UI
  if (isEmailSentStep) {
    return (
      <Card className="w-full max-w-md mx-auto text-center">
        <CardHeader>
          <CardTitle>仮登録が完了しました</CardTitle>
          <CardDescription>
            ご入力いただいたメールアドレス（{email}）宛てに確認メールを送信しました。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mailpit（<a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-primary underline">http://localhost:8025</a>）を開き、届いたメールの「メールアドレスを検証する」ボタンをクリックして登録を完了させてください。
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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>
          {isOtpStep
            ? "2段階認証コードの入力"
            : isSignUp
            ? "アカウント作成"
            : "ログイン"}
        </CardTitle>
        <CardDescription>
          {isOtpStep
            ? "メールアドレスに送信された 6 桁の認証コードを入力してください"
            : isSignUp
            ? "必要な情報を入力してアカウントを作成してください"
            : "登録済みのメールアドレスとパスワードを入力してください"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-white bg-destructive rounded-md">
              {error}
            </div>
          )}

          {isOtpStep ? (
            <div className="space-y-2">
              <Label htmlFor="otpCode">認証コード (6桁)</Label>
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
            {loading
              ? "処理中..."
              : isOtpStep
              ? "認証してログイン"
              : isSignUp
              ? "アカウント作成"
              : "ログイン"}
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
              {isSignUp
                ? "すでにアカウントをお持ちの方（ログイン）"
                : "アカウントをお持ちでない方（新規登録）"}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

```

---

## 8. 動作検証フロー (完全 2ステップテスト)

1. アプリケーションおよび Docker（Mailpit）を起動します。

```bash
pnpm dev

```

2. **新規登録（ステップ 1）のテスト**

* `/login` 画面で新規登録を行います。
* 画面が「仮登録が完了しました」案内に切り替わることを確認します。
* ターミナルに `[Email Verification]` のログが出力されていることを確認します。
* この状態で「ログイン」を試みると、「メールアドレスが未検証です」エラーで強固にブロックされることを確認します。

3. **メールアドレス検証のテスト**

* Mailpit (`http://localhost:8025`) を開きます。
* 「【メールアドレスの確認】アカウント登録手続き」メールを開き、「メールアドレスを検証する」リンクをクリックします。
* 自動的にブラウザが開き、`/login`（設定した callbackURL）へリダイレクトされればメール認証成功です。

4. **ログイン ＆ 2FA（ステップ 2）のテスト**

* メール検証後、再度 `/login` で登録したメール・パスワードを入力してログインを実行します。
* メール検証ブロックを通過し、画面が「2段階認証コードの入力」に切り替わります。
* Mailpit に新しく届いた「【ログイン認証コード】2段階認証のご案内」メールから 6 桁の OTP を確認し、画面に入力します。
* 正常に `/dashboard` へ遷移することを確認します。