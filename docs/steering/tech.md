# 技術スタック & 品質規約

## スタック構成
- **Framework**: Next.js 16 (App Router / Turbopack)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS + Base UI + shadcn/ui
- **Database / ORM**: PostgreSQL 16 + Drizzle ORM
- **Authentication**: Better Auth (organization プラグイン)
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
- **認証**: Better Auth の Drizzle アダプターを使用し、メール検証と OTP ベースの二段階認証を有効にする。メール送信は Nodemailer 経由で行い、環境依存の接続情報は環境変数で設定する。
- **データモデル**: PostgreSQL のテーブル定義は Drizzle スキーマに集約し、組織・ユーザー・メンバーシップを分離してテナントとロールを扱う。
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

---
_2026-09-10 更新: 不足していたプロダクト／構成ステアリングの追加に合わせ、既存の品質規約を保持したまま実装上の境界と開発規約を追記。_
