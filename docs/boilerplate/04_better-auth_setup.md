# ① Better Auth 基本導入手順書

本手順書では、Next.js 16 (App Router) / Drizzle ORM / PostgreSQL 環境への **Better Auth** 基本機能（メール・パスワード認証およびセッション管理）の組み込み手順を解説します。

---

## 1. パッケージのインストール

Better Auth 本体をインストールします。

```bash
pnpm add better-auth

```

---

## 2. 環境変数の設定

`.env.example` および `.env.local` に Better Auth 用の設定を追加します。

### ① `.env.example` への追加

`.env.example`

```env
# Better Auth 設定
BETTER_AUTH_SECRET="your-super-secret-key-at-least-32-chars-long"
BETTER_AUTH_URL="http://localhost:3000"

```

### ② `.env.local` への追加と Secret の生成

ターミナルで以下のコマンドを実行し、安全な 32 バイトのランダム文字列を生成して `.env.local` の `BETTER_AUTH_SECRET` に設定します。

```bash
openssl rand -base64 32

```

`.env.local`

```env
BETTER_AUTH_SECRET="生成されたランダム文字列"
BETTER_AUTH_URL="http://localhost:3000"

```

---

## 3. Drizzle スキーマへの認証テーブル追加

`src/db/schema.ts` に Better Auth が標準で使用する 4 つのテーブル（`user`, `session`, `account`, `verification`）を定義します。

`src/db/schema.ts`

```typescript
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

// ==========================================
// Better Auth 基本テーブル定義
// ==========================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"), // オプション項目（OAuth連携等で使用、nullable）
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

```

---

## 4. Better Auth 設定ファイルの作成 (`src/lib/auth.ts`)

サーバーサイドで認証処理を担う Better Auth インスタンスを定義します。

`src/lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),
  emailAndPassword: {
    enabled: true, // メールアドレス・パスワード認証を有効化
  },
});

```

---

## 5. API ルートの作成 (`src/app/api/auth/[...all]/route.ts`)

Better Auth の各種認証処理ハンドラーを Next.js の Dynamic API Route にマウントします。

`src/app/api/auth/[...all]/route.ts`

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);

```

---

## 6. Auth クライアントの作成 (`src/lib/auth-client.ts`)

Client Components から認証機能（ログイン、ログアウト、セッション参照等）を呼び出すためのクライアントを作成します。

`src/lib/auth-client.ts`

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export const { useSession, signIn, signUp, signOut } = authClient;

```

---

## 7. データベースへの反映

追加した認証用テーブルを PostgreSQL に反映します。

```bash
pnpm db:push

```

---

## 8. UIの実装（ログイン・ダッシュボード）

### 8.1 必要な UI コンポーネントの追加 (shadcn/ui)

```bash
pnpm dlx shadcn@latest add button card input label

```

### 8.2 ログアウトボタンの実装 (`src/components/sign-out-button.tsx`)

`src/components/sign-out-button.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <Button variant="outline" onClick={handleSignOut}>
      ログアウト
    </Button>
  );
}

```

### 8.3 保護されたダッシュボード画面の実装 (`src/app/dashboard/page.tsx`)

`src/app/dashboard/page.tsx`

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>ダッシュボード</CardTitle>
          <CardDescription>
            ログイン中のユーザーのみアクセスできる保護されたページです。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-background rounded-lg border space-y-2">
            <div>
              <span className="text-xs text-muted-foreground block">表示名</span>
              <span className="font-medium">{session.user.name}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">メールアドレス</span>
              <span className="font-medium">{session.user.email}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">ユーザーID</span>
              <span className="text-xs font-mono">{session.user.id}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

```

---