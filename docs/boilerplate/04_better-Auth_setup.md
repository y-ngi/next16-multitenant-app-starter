Better Auth 導入手順書の Markdown です。

---

# 🔐 Better Auth 導入手順書

本手順書では、Next.js 16 (App Router) / Drizzle ORM / PostgreSQL 環境への **Better Auth** の組み込み手順を解説します。

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

`src/db/schema.ts` に Better Auth が標準で使用する 4 つのテーブル（`user`, `session`, `account`, `verification`）を追記します。

`src/db/schema.ts`

```typescript
import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

// ==========================================
// Better Auth 用テーブル定義
// ==========================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
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

## 8. 動作確認手順

1. 開発サーバーを起動します。
```bash
pnpm dev

```


2. Drizzle Studio を起動してテーブルが正しく作成されたか確認します。
```bash
pnpm db:studio

```


* ブラウザで `user`, `session`, `account`, `verification` テーブルが追加されていることを確認します。



---

次はこの手順に続けて、**「ログイン・新規登録画面 UI の実装（shadcn/ui）」** や **「OAuth（Google / GitHub）追加」** の手順を作成できますが、どちらから進めましょうか？