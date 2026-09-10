# next16-multitenant-app-starter

# **マルチテナント型 Web アプリケーション開発テンプレート**

## **1. プロジェクトの目的・コンセプト**

本ドキュメントは、汎用性の高いマルチテナント型 SaaS・Web アプリケーションを迅速に立ち上げるための「スターターテンプレート（ベース基盤）」の設計および開発仕様をまとめたものです。

最小限のシンプルな構成からスタートしつつも、将来的に様々なサービスへ展開・拡張できる柔軟性を備えています。

### **本テンプレートのコア思想**

* **まずは Next.js 単体でシンプルに構築**
初期開発のスピードと運用しやすさを最優先し、Next.js 16 のフルスタック（モノリス）構成でライトに立ち上げます。
* **将来の「フロント / バックエンド分離」を考慮した設計**
初期開発段階では分離・複雑な構成構築は行いませんが、将来的にサービスが拡大した際、コードの大幅な書き換えなしで「フロントエンド（Cloudflare 等）」と「バックエンド（Hono 等）」へ簡単に切り出せるよう、ビジネスロジックや認証層をあらかじめ疎結合に整理しておきます。

---

## **2. システム構成（フェーズ 1：本テンプレートの構成）**

初期フェーズとして構築する構成です。すべての処理を Next.js 内で完結させ、爆速での開発を実現します。

* **実行環境**: Local Dev Container (Node.js 24) / Google Cloud Run
* **フレームワーク**: Next.js 16 (App Router / Turbopack)
* **パッケージマネージャー**: pnpm
* **言語・型定義**: TypeScript
* **スタイル & UI**: Tailwind CSS + Base UI + shadcn/ui
* **静的解析・品質管理**: ESLint 9 (Flat Config / `eslint.config.mjs`)
* **コードフォーマッター**: Prettier + `prettier-plugin-tailwindcss`
* **テスト環境 (TDD)**: Vitest + React Testing Library
* **認証基盤**: Better Auth (organization プラグインを使用)
* **ORM (ORマッパー)**: Drizzle ORM
* **データベース**: PostgreSQL 16
* **メールテスト環境**: Mailpit (SMTP キャッチャー)
* **AI 開発ハーネス (SDD)**: cc-sdd (Spec-Driven Development) ※ [導入・運用ガイド](./ccsdd_startup.md)

---

## **3. データモデル & 権限設計（汎用 4 テーブル ＋ リンク構造）**

あらゆるマルチテナントサービスにそのまま転用できるよう、ユーザー（人物アカウント）と組織（テナント）を完全に独立させたデータ構造を採用しています。

### **構造のポイント**

* **完全独立ユーザー**: ユーザーテーブルはログイン認証情報（email, password_hash, password_salt）のみを保持します。
* **所属・ロールの共通化**: 「誰がどの組織に、どんな役割（Role）で属しているか」は、組織側の中間テーブルで保持します。1 ユーザーが複数の組織に属する構成にも標準対応しています。

### **エンティティ一覧**

#### **1. 管理者（運営）領域**

* **admin_users**: 管理者ユーザーアカウント（完全独立）
* **admin_organizers**: 運営組織グループ（初期シードデータ: 1. システム管理者, 2. サービス運営者）
* **admin_organizer_memberships**: 管理者の所属および権限（owner, operator 等）

#### **2. 一般（顧客）領域**

* **general_users**: 一般ユーザーアカウント（完全独立）
* **general_organizers**: 契約企業・テナント組織
* **general_organizer_memberships**: 一般ユーザーの所属および権限（owner, member, viewer 等）
* **user_favorites**: 組織に依存しない個人用データ（お気に入り・履歴等）のサンプル構造

---

## **4. 認証・アクセス状態マトリクス**

システム上のアクセス状態を以下の 6 パターンに分類し、共通の認可ガードとして定義します。

* **状態 1（管理側：未認証）**: アクセス拒否（管理ログイン画面へ案内）
* **状態 2（管理側：未所属）**: 待機状態（「チーム未割り当て」警告の表示）
* **状態 3（管理側：アクティブ）**: 管理機能の実行（システム管理またはサービス運営）
* **状態 4（一般側：未認証）**: ゲスト領域（LP、サービス紹介、ログイン画面）
* **状態 5（一般側：未所属）**: 個人向け機能の利用（お気に入り登録、個人設定、組織の新規作成）
* **状態 6（一般側：アクティブ）**: 組織機能 ＋ 個人機能の利用（テナント共有データの操作）

---

## **5. コード品質・テスト管理基盤**

本プロジェクトでは、コード品質の維持、見た目の統一、バグの早期発見を目的に以下のツールを分離運用しています。

### **1. 静的解析（ESLint 9 Flat Config）**

* `eslint.config.mjs` によるネイティブ Flat Config 構成を採用。
* TypeScript の型安全性や Next.js / React 19 のアンチパターン（`useEffect` 内での同期的な `setState` 等）を検知します。
* `src/components/ui/`（shadcn/ui）や独自機能コンポーネントもカスタマイズ時の品質維持のため、ESLint のチェック対象に含めて運用します。

### **2. コードフォーマット（Prettier）**

* `.prettierrc`（JSON）にてシングルクォート、末尾カンマ（`all`）、行長 100 文字、改行コード `LF` に固定。
* `prettier-plugin-tailwindcss` により、JSX 内の Tailwind CSS クラス名を標準の推奨順に自動ソートします。
* `.prettierignore` により、`src/components/ui/`（shadcn/ui 公式コード）および `*.md`（ドキュメント手動レイアウト）は整形対象から除外しています。

### **3. テスト駆動開発（Vitest + React Testing Library）**

* Vite エコシステムを利用した高速な単体・結合テスト環境を構築。
* コンポーネントの挙動、Hooks、認証ロジックなどのテストを `pnpm test`（Watch モード）で即座に検証可能です。

### 4. AI 開発ハーネス（cc-sdd）
* 仕様駆動開発（Spec-Driven Development）の運用ツールとして `cc-sdd` を導入。
* 要件定義 (`requirements.md`) ➔ 技術設計 (`design.md`) ➔ タスク分解 (`tasks.md`) ➔ TDD実装 (`/kiro-impl`) のステップで AI と連携して安全に開発を進行できます。
* 詳しい導入手順や使い方は [cc-sdd 導入・運用ガイド](./ccsdd_startup.md) を参照してください。

---

## **6. 開発環境のセットアップ (Dev Container)**

本テンプレートは VS Code / Cursor の Dev Container に対応しており、Docker さえあればチーム全員が同一環境で即座に開発を開始できます。

### **起動手順**

1. 本プロジェクトを VS Code（WSL2 / Linux 環境）で開きます。
2. コマンドパレット (`Ctrl+Shift+P`) を開き、**`Dev Containers: Reopen in Container`** を実行します。
3. ビルド完了後、画面左下のステータスバーが `Dev Container: Next.js 16 Multitenant Starter` となっていれば完了です。

### **ポートマッピング一覧**

* **Next.js Web アプリ**: [http://localhost:3000](http://localhost:3000)
* **Mailpit (メール受信確認 UI)**: [http://localhost:8025](http://localhost:8025)
* **PostgreSQL**: `localhost:5432`

---

## **7. 主な開発コマンド**

すべて **Dev Container 内の統合ターミナル** で実行します。

### **開発・ビルド**

```bash
# パッケージインストール
pnpm install

# 開発サーバー起動 (Turbopack)
pnpm dev

# 本番ビルド & 起動
pnpm build
pnpm start

```

### **静的解析・フォーマット・テスト**

```bash
# ESLint によるコードチェック
pnpm lint

# ESLint による修復可能なエラーの自動修正
pnpm lint:fix

# Prettier によるプロジェクト全体の自動整形 (Tailwind クラス順含む)
pnpm format

# Prettier による整形チェック (CI 用)
pnpm format:check

# Vitest テスト実行 (Watch モード)
pnpm test

# Vitest 単発実行 (CI 用)
pnpm test:run

# カバレッジレポート出力
pnpm test:coverage

```

### **データベース操作 (Drizzle ORM)**

```bash
# DB テーブル構造の直接反映（開発用）
pnpm db:push

# DB マイグレーションファイルの生成
pnpm db:generate

# DB マイグレーションの実行
pnpm db:migrate

# シードデータ（初期データ）の投入
pnpm db:seed

# DB の完全初期化（テーブル再作成 ＋ シードデータ投入）
pnpm db:reset

# Drizzle Studio (DB閲覧 GUI) 起動
pnpm db:studio

```

> **💡 コンテナレベルで DB を完全リセットしたい場合**
> パスワード不一致や DB 構成の根本的な不具合などで Docker ボリュームごと全削除して初期化したい場合は、以下を実行します。
> ```bash
> # ボリューム（データ）を含めてコンテナを削除・再起動
> docker compose down -v && docker compose up -d
> 
> # テーブル作成と初期データを再投入
> pnpm db:reset
> 
> ```
> 
> 

---

## **8. ディレクトリ構造**

```text
.
├── .devcontainer/         # Dev Container & Docker Compose 設定
├── public/                # 静的ファイルアセット
├── src/
│   ├── app/               # Next.js App Router (ページ・APIルート)
│   ├── components/        # UIコンポーネント (shadcn/ui / 独自コンポーネント)
│   │   └── ui/            # shadcn/ui 原資コンポーネント (Prettier対象外)
│   ├── db/                # Drizzle ORM スキーマ & クライアント設定
│   ├── hooks/             # カスタム Hooks
│   └── lib/               # Better Auth 設定 & 共通ロジック
├── .gitignore             # Git 管理除外設定
├── .prettierignore        # Prettier 自動整形除外設定
├── .prettierrc            # Prettier フォーマット設定
├── drizzle.config.ts      # Drizzle Kit 設定ファイル
├── eslint.config.mjs      # ESLint 9 Flat Config 設定ファイル
├── next.config.ts         # Next.js 設定ファイル
├── package.json           # 依存パッケージ & NPM スクリプト管理
├── pnpm-lock.yaml         # pnpm ロックファイル
├── tsconfig.json          # TypeScript 設定ファイル
├── vitest.config.ts       # Vitest テスト環境設定ファイル
└── README.md              # プロジェクトドキュメント

```

---

## **9. 付録（Appendix）：将来の拡張アーキテクチャ詳細**

本セクションでは、本テンプレートが将来的にフロントエンドとバックエンドを物理分離（フェーズ 2）する際の設計方針およびアーキテクチャ図解を記録します。

### **付録 A. ロードマップと全体アーキテクチャ図解**

#### **1. フェーズ 1：本テンプレートの基本構成（Next.js モノリス）**

開発スピードと AI 連携の効率を最優先した構成です。すべての処理（画面描画、認証、DB操作）を Next.js 16 のコンテナ内で処理します。

```text
[ 開発環境 (Dev Container) / 本番 (Cloud Run) ]  
  └─ Next.js 16 (App Router)  
        ├── UI レイヤー: Tailwind CSS + shadcn/ui  
        ├── 認証レイヤー: Better Auth (adminAuth / userAuth)  
        └── データレイヤー: Drizzle ORM  
            │  
            ▼  
 [ データベース: PostgreSQL 16 (Cloud SQL / ローカル) ]

```

#### **2. フェーズ 2：将来の拡張・分離構成（Cloudflare SSR ＋ Hono API）**

サービス規模が拡大し、フロントエンドの更なる高速化やバックエンドの独立スケールが必要になった際の構成です。

本テンプレートでビジネスロジックを疎結合に保っているため、最小限の工数で移行が可能です。

```text
【フロントエンド層】                         【バックエンド層】  
 [ Cloudflare Workers / Pages ] ───(HTTP)───► [ Google Cloud Run / Workers ]  
   └─ Next.js (SSR 描画エンジン)                └─ Hono API Server  
                                                  ├── Better Auth Server  
                                                  └── Drizzle ORM  
                                                      │  
                                                      ▼  
                                           [ Managed PostgreSQL ]

```

### **付録 B. 分離移行（フェーズ 2）時のデータ・認証フロー**

フロントエンドとバックエンドを分離した際も、本テンプレートの「4 テーブル構造 ＋ 6 つのアクセス状態判定」のロジックはそのまま維持されます。

1. **認証処理の集約**
Better Auth のサーバー処理および DB アダプターは、バックエンド（Hono）側に配置されます。
2. **フロントエンドでのセッション参照**
Next.js 側は DB に直接接続せず、Better Auth Client（`createAuthClient`）経由で Hono へ HTTP リクエスト（Cookie 送信）を行い、セッション状態（6 つの状態マトリクス）を判定します。
3. **CORS と Cookie 共有**
`app.example.com`（フロント）と `api.example.com`（バックエンド）のように同一ドメインのサブドメイン運用とすることで、SameSite Cookie による安全な認証共有を行います。