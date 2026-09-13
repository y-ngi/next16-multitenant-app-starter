# 技術スタック & 品質規約

## スタック構成
- **Framework**: Next.js 16 (App Router / Turbopack)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS + Base UI + shadcn/ui
- **Database / ORM**: PostgreSQL 16 + Drizzle ORM
- **Authentication**: Better Auth（認証）+ 独自の組織・ロール基盤
- **Quality**: ESLint 9 Flat Config (`eslint.config.mjs`) / Prettier
- **Testing**: Vitest + React Testing Library

## 開発・実装ルール
1. **TDD（テスト駆動開発）の遵守**
   - 機能を実装する際は、まず `src/.../*.test.ts(x)` に失敗するテスト（RED）を作成してから実装コード（GREEN）を書くこと。
2. **フォーマット除外**
   - `src/components/ui/`（shadcn/ui コンポーネント）は設計変更時以外、コードスタイル変更のみの修正は避けること。
3. **型安全性の維持**
   - `any` 型の使用は禁止（テストファイルに限り例外的に許可）。

## アーキテクチャと実装方針
- **実行形態**: Next.js に画面、認証、データアクセスを集約するフルスタックモノリスから開始する。将来の API 分離を妨げないよう、認証設定は `src/lib/`、DB 実装は `src/db/` に分離する。
- **ルーティングと認可**: App Router のサーバーコンポーネントでリクエストヘッダーからセッションを取得し、保護ページは未認証時にログイン画面へリダイレクトする。
- **認証**: Better Auth の Drizzle アダプターを使用し、メール検証と OTP ベースの二段階認証を有効にする。Better Auth はユーザー認証とセッション管理に限定し、組織・メンバーシップ・ロールの業務ロジックを organization プラグインへ依存させない。メール送信は Nodemailer 経由で行い、環境依存の接続情報は環境変数で設定する。
- **データモデル**: PostgreSQL のテーブル定義は Drizzle スキーマに集約し、組織・ユーザー・メンバーシップを分離してテナントとロールを扱う。組織ロールは独自に管理し、初期段階では `owner` と `member` の2種類に限定する。
- **UI**: Tailwind CSS のユーティリティクラスを基本とし、shadcn/ui と Base UI のプリミティブを再利用する。`src/components/ui/` の生成済みプリミティブは必要な設計変更以外で変更しない。

## 開発環境と運用コマンド
- **パッケージマネージャー**: pnpm 11
- **Node.js**: Dev Container の Node.js 24 を標準開発環境とする。
- **モジュール解決**: TypeScript の strict mode と `@/*` → `src/*` のパスエイリアスを使用する。

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test:run
```

## テスト規約

- Vitest と React Testing Library を使い、ブラウザ相当のテストには jsdom を使用する。
- テストは原則として対象実装に隣接して配置し、共通セットアップは `tests/` に置く。
- 実装前に失敗するテストを作成し、最小限の実装で通過させる TDD を標準とする。

## DB マイグレーション運用ルール

- **クエリ方式**: Drizzle の Relational Queries (`db.query.<table>.findFirst`/`findMany`) は環境によって `LEFT JOIN LATERAL` や `json_build_array` を含む SQL を生成し、実行時エラーの原因になりやすいため使用しない。必ず `db.select().from().where()` / `.innerJoin()` / `db.insert()` / `db.update()` / `db.transaction()` など、明示的な標準クエリビルダーを使用すること。
- **既存マイグレーションファイルの直接編集禁止**: `drizzle/*.sql` に一度出力されたマイグレーションファイルは、既に適用済みの開発環境が存在する前提で扱い、直接編集しない。スキーマを変更する場合は必ず `pnpm db:generate` で新しいマイグレーションファイルを追加すること。過去に適用済みの migration ファイルを書き換えると、その migration をすでに適用済みの DB では変更が反映されず、`column "xxx" does not exist` のような不整合エラーの原因になる。
- **開発環境のスキーマ不整合が疑われる場合**: `pnpm db:push` でローカル DB のスキーマを `src/db/schema.ts` の内容へ直接同期できる（開発用途限定）。

---
_2026-09-12 更新: 組織・ロールの業務ロジックを Better Auth organization プラグインから分離し、独自の組織基盤と `owner`／`member` の2ロールを採用する方針へ更新。_
_2026-09-13 更新: Drizzle Relational Queries の実行時エラーを受け、標準クエリビルダーへの統一と、既存マイグレーションファイルの直接編集禁止ルールを追加。_
