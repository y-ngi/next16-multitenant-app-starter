ロールバックを踏まえた、**Drizzle ORM（PostgreSQL）導入手順書**の決定版です。

pnpm v10 のセキュリティ仕様（`esbuild` のビルドブロック）をあらかじめ回避する設定を含めていますので、この通り進めればエラーなく安全にセットアップが完了します。

---

# 🗄️ Drizzle ORM 導入手順書

## 1. pnpm ビルド許可設定の作成

pnpm (v10以降) のセキュリティ仕様に対応するため、信頼できるビルドツール `esbuild` のスクリプト実行を許可する設定ファイルをプロジェクトルート直下に作成します。
drizzle-kit インストール時に古いesbuildに依存してエラーが出るので、esbuildの警告が出ないように修正

`pnpm-workspace.yaml`

```yaml
allowBuilds:
  esbuild: true

```

---

## 2. 関連パッケージのインストール

Drizzle ORM と PostgreSQL クライアント、環境変数管理ツール、および開発用 CLI を一括でインストールします。

```bash
# 本体、ドライバー、dotenv のインストール
pnpm add drizzle-orm postgres dotenv

# 開発用ツール（CLI & TypeScript 実行環境）のインストール
pnpm add -D drizzle-kit tsx

```

---

## 3. `.env.example` と `.env.local` の作成

環境変数のテンプレートを作成し、ローカル用の設定ファイルへコピーします。

### ① `.env.example` の作成（Git 管理対象）

プロジェクトルート直下に `.env.example` を作成します。

`.env.example`

```env
# データベース接続 URL（DevContainer / ローカル PostgreSQL 用）
DATABASE_URL="postgres://postgres:postgres@localhost:5432/my_app_db"

# アプリケーション基本設定
NEXT_PUBLIC_APP_URL="http://localhost:3000"

```

### ② `.env.local` へのコピー（Git 管理対象外）

以下のコマンドで `.env.local` を生成します。

```bash
cp .env.example .env.local

```

---

## 4. DevContainer 設定の更新

コンテナ起動時に `.env.local` が未存在の場合のみ自動生成するよう、`.devcontainer/devcontainer.json` の `postCreateCommand` を更新します。

`.devcontainer/devcontainer.json`

```json
  "forwardPorts": [3000, 5432, 8025],
  "postCreateCommand": "cp -n .env.example .env.local || true && pnpm --version"
}

```

---

## 5. Drizzle 設定ファイルの作成 (`drizzle.config.ts`)

プロジェクトルートに `drizzle.config.ts` を作成し、`dotenv` で `.env.local` を明示的に読み込みます。

`drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Next.js の .env.local を明示的にロード
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

---

## 6. スキーマ定義 (`src/db/schema.ts`)

`src/db/schema.ts` を作成し、マルチテナント構造（ユーザー・組織・メンバーシップ）を定義します。

`src/db/schema.ts`

```typescript
import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";

// 1. ユーザーテーブル
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. 組織（テナント）テーブル
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. メンバーシップ（中間テーブル: User - Organization）
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
  ]
);

```

---

## 7. DB クライアント接続設定 (`src/db/index.ts`)

`src/db/index.ts` を作成します。

`src/db/index.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing in environment variables.");
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

```

---

## 8. 初期データ投入スクリプトの作成 (`src/db/seed.ts`)

`src/db/seed.ts` を作成します。

`src/db/seed.ts`

```typescript
import { config } from "dotenv";
import { db } from "./index";
import { users, organizations, memberships } from "./schema";

config({ path: ".env.local" });

async function main() {
  console.log("🌱 初期データの投入を開始します...");

  // 1. テストユーザーの作成
  const [user] = await db
    .insert(users)
    .values({
      name: "テストユーザー",
      email: "test@example.com",
    })
    .returning();

  // 2. テスト組織（テナント）の作成
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Acme Corp",
      slug: "acme-corp",
    })
    .returning();

  // 3. メンバーシップの紐付け
  await db.insert(memberships).values({
    userId: user.id,
    organizationId: org.id,
    role: "admin",
  });

  console.log("✅ 初期データの投入が完了しました！");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ シード実行エラー:", err);
  process.exit(1);
});

```

---

## 9. `package.json` へのスクリプト追加

`package.json` の `scripts` 項目に Drizzle 操作および DB リセット用コマンドを追加します。

`package.json`

```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx src/db/seed.ts",
  "db:reset": "pnpm db:push --force && pnpm db:seed"
}

```

---

## 10. データベース構造の適用とシードデータの投入

作成したコマンドを実行し、データベースにテーブルを作成した上でサンプルデータを投入します。

```bash
# 1. スキーマ（テーブル構造）を DB に反映
pnpm db:push

# 2. 初期データを投入
pnpm db:seed

```

---

## 11. 投入データの確認（データベース閲覧）

データの投入確認やテーブル構造の表示には、以下の 2 つの方法が使用できます。

### 方法 A: Drizzle Studio（推奨・Web GUI）

専用の Web 画面でテーブル構造やレコードを直感的に確認・編集できます。

```bash
pnpm db:studio

```

* 実行後、ターミナルに表示された URL（例: `[https://local.drizzle.studio](https://local.drizzle.studio)` または指示されたローカルポートの URL）へブラウザでアクセスします。
* `users` / `organizations` / `memberships` テーブルを選択し、`pnpm db:seed` で追加されたレコードが表示されていることを確認します。

### 方法 B: VS Code 拡張機能（SQLTools）

DevContainer に標準インストールされている SQLTools を使い、VS Code の画面内でデータベースを参照します。

1. VS Code 左側のアクティビティバーにある **SQLTools アイコン**（データベースのマーク）を選択します。
2. **Add new connection** をクリックし、ドライバー一覧から **PostgreSQL** を選択します。
3. 接続設定に以下を入力して保存（Save Connection）します：
* **Connection Name**: `Dev Container DB`
* **Server Address**: `db`
* **Port**: `5432`
* **Database**: `app_db`
* **Username**: `postgres`
* **Password**: `postgres_password`


4. 作成された接続をクリックして接続（Connect）し、ツリー表示からテーブルやデータを参照します。