これまでの全工程および対話型の選択肢、安全なファイル移動手順を反映した最新・完全版の **Next.js 16 セットアップ手順書** です。

---

# Next.js 16 (App Router + Tailwind CSS + pnpm) 初期化手順

本手順は、Dev Container のコンテナ内（`/workspace`）において、既存の設定ファイル（`.devcontainer`等）と衝突させることなく、最新安定版の Next.js 16 をクリーンに初期化・配置するための手順です。

---

## 1. 対話型プロンプトの選択方針（理由付き）

`pnpm create next-app@latest` 実行時のプロンプト設定と選択理由は以下の通りです。

| 選択項目 | 設定内容 | 設定理由 |
| --- | --- | --- |
| **Next.js defaults** | **`No, customize settings`** | デフォルト値では `src/` directory が No になってしまうため、カスタマイズを選択します。 |
| **TypeScript** | **Yes** | マルチテナント開発における識別子（`tenantId`）や権限情報、APIの型安全性を確保するため必須です。 |
| **Linter** | **ESLint** | コード品質の表記揺れや構文エラーを自動チェックし、プロジェクト全体の保守性を保ちます。 |
| **React Compiler** | **No** | 先進機能ですが、サードパーティ製ライブラリとの競合やデバッグ難易度上昇を避けるため、初期構築時はオフにします。 |
| **Tailwind CSS** | **Yes** | ユーティリティクラスによる高速な UI 構築と、テナントごとのテーマ切り替え（マルチテーマ）に対応するためです。 |
| **`src/` directory** | **Yes** | ルートにある設定ファイル群とアプリケーションコード（`app/`, `components/`等）を分離して視認性を高めます。 |
| **App Router** | **Yes** | Server Components や Dynamic Routes を活用し、マルチテナントの動的ルーティング（`app/[tenant]/...` 等）を効率的に設計するためです。 |
| **Turbopack** | **Yes** | Rust ベースの超高速ビルドエンジンで、コンテナ内での HMR や開発サーバー起動速度を大幅に短縮します。 |
| **Import alias** | **No** (`@/*`) | `@/*` は標準的なパスエイリアス設定であり、`import { Component } from "@/components/..."` と直感的に書けるようにします。 |
| **AGENTS.md** | **No / YES** | AI コーディングエージェントに対して「このプロジェクトでは Next.js の最新仕様やベストプラクティスに従ってコードを書いてください」という指示。好きなほうを選択 |

---

## 2. セットアップ実行手順

1. **1. 一時ディレクトリへの Next.js 16 生成:** Dev Container ターミナル.
ルートの既存ファイルとの衝突を避けるため、`temp-app` フォルダに対して初期化を実行します。

```bash
pnpm create next-app@latest temp-app

```

※ 上記表のプロンプト方針に従って選択を進めます。


2. **2. ファイルの安全なルート展開:** Dev Container ターミナル.
生成されたファイルをプロジェクトルート（`/workspace`）へ安全に移動し、一時フォルダを削除します。

```bash
# 隠しファイル（.gitignore等）をルートへ移動
mv temp-app/.* . 2>/dev/null || true

# 通常のファイル/フォルダをルートへ移動
mv temp-app/* . 2>/dev/null || true

# 一時フォルダの削除
rmdir temp-app

# 安全のため dotglob フラグを解除
shopt -u dotglob

```


3. **3. 開発サーバーの起動確認:** Dev Container ターミナル.
Turbopack を使用して開発サーバーを立ち上げます。

```bash
pnpm dev

```

起動後、ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスし、Next.js 16 のウェルカムページが表示されることを確認します。


4. **4. Git コミット:** Dev Container ターミナル.
開発サーバーを停止（`Ctrl + C`）し、初期化状態をコミットします。

```bash
git add .
git commit -m "feat: Next.js 16 (App Router + Tailwind CSS + pnpm) の初期化"

```


---
