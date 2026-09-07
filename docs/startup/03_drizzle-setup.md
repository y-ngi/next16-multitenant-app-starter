**データベース接続および Drizzle ORM のセットアップ**を進めます。

Docker Compose で起動済みの PostgreSQL 16 コンテナへ接続し、Drizzle ORM を用いたスキーマ定義とマイグレーションを実行できる環境を構築します。

---

## 1. 依存パッケージのインストール

Dev Container 内のターミナルで、Drizzle ORM および PostgreSQL ドライバ（`postgres`）と開発用ツール（`drizzle-kit`）をインストールします。

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit dotenv

```

---

## 2. 環境変数の設定 (`.env`)

プロジェクト直下に `.env` ファイルを作成（または編集）し、Docker Compose（`docker-compose.yml`）で定義されている PostgreSQL の接続情報を設定します。

```env
# .env
DATABASE_URL="postgres://postgres:postgres@db:5432/app_db"

```

> **解説**:
> Dev Container のネットワーク内からは、サービス名の `db`（ポート `5432`）で直接 PostgreSQL コンテナにアクセスできます。

---

## 3. Drizzle 設定ファイルの作成 (`drizzle.config.ts`)

プロジェクトルート直下に `drizzle.config.ts` を作成します。マイグレーションファイルの出力先や DB 接続情報を記述します。

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

---

## 4. DB クライアントとマルチテナント用スキーマの定義

`src/db/` ディレクトリを作成し、接続クライアントと初期スキーマを定義します。

### 4.1 クライアント設定 (`src/db/index.ts`)

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Node.js のグローバルキャッシュによる開発時のマルチインスタンス化防止
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });

```

### 4.2 スキーマ定義 (`src/db/schema.ts`)

設計方針（マルチテナント 4 テーブル構造）に基づき、基盤となる「一般ユーザー」および「テナント（組織）」のテーブルを定義します。

```typescript
// src/db/schema.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// 1. 一般ユーザーテーブル（認証・人物情報に特化）
export const generalUsers = pgTable("general_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. 一般テナント（組織）テーブル
export const generalOrganizers = pgTable("general_organizers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // サブドメインやURLパス識別用 (例: "acme")
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. テナント所属・権限中間テーブル
export const generalOrganizerMemberships = pgTable("general_organizer_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => generalUsers.id, { onDelete: "cascade" }),
  organizerId: uuid("organizer_id").notNull().references(() => generalOrganizers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // 'owner' | 'member' | 'viewer'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

```

---

## 5. マイグレーションの生成と実行

定義したスキーマをもとに SQL マイグレーションファイルを生成し、PostgreSQL へ反映します。

```bash
# マイグレーションSQLの生成
pnpm drizzle-kit generate

# DBへの適用
pnpm drizzle-kit migrate

```

---

## 6. 動作確認（Drizzle Studio または 導通確認コード）

データベースが正しく構築されたか確認します。別ターミナルで Drizzle Studio を起動すると、ブラウザ上で GUI からテーブル構造を確認できます。

```bash
pnpm drizzle-kit studio

```

起動後、表示されるローカル URL（標準では `[https://local.drizzle.studio](https://local.drizzle.studio)` 等）にアクセスし、`general_users` などのテーブルが正しく作成されているか確認してください。

動作確認が取れたら、以下のコマンドでセットアップ状態を Git コミットします。

```bash
git add .
git commit -m "feat: Drizzle ORM のセットアップおよび初期マルチテナントスキーマの作成"

```

