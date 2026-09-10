# 🤖 cc-sdd (Spec-Driven Development) 導入・運用ガイド

本ドキュメントは、AI コーディングエージェントを用いて仕様駆動開発（SDD: Spec-Driven Development）を行うツール **`cc-sdd`** の導入手順および運用ルールを解説するガイドです。

`cc-sdd` を利用することで、「あいまいな指示でのコード自動生成」を防ぎ、**要件定義 ➔ 技術設計 ➔ タスク分解 ➔ TDD（テスト駆動開発）での確実な実装** を段階的に進めることができます。

> 📖 **公式ドキュメント・リポジトリ**
> 最新のアップデート情報や詳細なオプション仕様については、公式ページを参照してください。
> * **GitHub**: [gotalab/cc-sdd (GitHub)](https://github.com/gotalab/cc-sdd)
> * **npm**: [cc-sdd (npm)](https://www.google.com/search?q=https://www.npmjs.com/package/cc-sdd)
> 
> 

---

## 1. 初回セットアップ

本ガイドでは **GitHub Copilot（VS Code 拡張）** を標準環境として解説します。

### ① パッケージのインストール

Dev Container 内の統合ターミナルで以下のコマンドを実行します。
仕様書等の出力先ディレクトリを標準の `.kiro` から `docs` に変更するため、`--kiro-dir docs` を付与します。

**GitHub Copilot 向け・日本語指定・出力先を docs に設定してセットアップ**
```bash
npx cc-sdd@latest --copilot-skills --lang ja --kiro-dir docs
```

> **💡 他の AI コーディングエージェントをお使いの場合:**
> `cc-sdd` は主要な AI エージェントに対応しています。利用環境に合わせてコマンドのフラグを差し替えてください。
> * **Claude Code**: `npx cc-sdd@latest --claude --lang ja --kiro-dir docs`
> * **Cursor**: `npx cc-sdd@latest --cursor --lang ja --kiro-dir docs`
> * **Windsurf**: `npx cc-sdd@latest --windsurf --lang ja --kiro-dir docs`
> * **Gemini CLI / その他**: AI指定フラグなしで実行すると対話型メニューで選択できます。
> 
> 

コマンドの実行完了後、GitHub Copilot 用のプロンプト構成ファイル（`.github/prompts/`）や仕様管理用ディレクトリ（`docs/` 配下）がプロジェクトルートに生成・整理されます。

---

## 2. プロジェクトルールの設定 (Steering)

`cc-sdd` は `docs/steering/` 配下のドキュメントを「プロジェクト共通の記憶（コンテキスト）」として参照します。本テンプレートの技術スタックに合わせたルールを反映させます。

### ① `docs/steering/tech.md` の作成・確認

`docs/steering/tech.md` に、本プロジェクトの品質基準やスタック情報を記述します。

```markdown
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

```

### ② `.prettierignore` の確認

`cc-sdd` が生成・管理する仕様書ドキュメント群（`docs/` ディレクトリ配下）が Prettier の自動整形によって手動レイアウトを崩されないよう、プロジェクトルートの `.prettierignore` で Markdown ファイルが除外設定されていることを確認します。

`.prettierignore`

```gitignore
# すべての Markdown ファイルを除外 (docs/ 配下含む)
*.md
**/*.md

```

---

## 3. 基本的な開発ワークフロー (仕様駆動開発の 6 ステップ)

GitHub Copilot Chat（または各 AI ツールのチャット画面）で以下のスラッシュコマンドを順番に呼び出し、Phase Gate（人間による確認・承認）を挟みながら開発を進めます。

```text
[1. 開発要求] ──► /kiro-discovery
                      │
[2. 仕様初期化] ──► /kiro-spec-init <機能名/概要>
                      │
[3. 要件定義] ──► /kiro-spec-requirements (requirements.md 生成)
                      │  └─ 👤 人間が内容を確認し承認
                      ▼
[4. 技術設計] ──► /kiro-spec-design (design.md 生成)
                      │  └─ 👤 人間が内容を確認し承認
                      ▼
[5. タスク分解] ──► /kiro-spec-tasks (tasks.md 生成)
                      │  └─ 👤 人間が内容を確認し承認
                      ▼
[6. 自動実装] ──► /kiro-impl (TDD サイクルで実装 & Vitest 検証)

```

### 各ステップの詳細

1. **`/kiro-discovery` (検討・分析)**
* これから作成する機能のスコープ整理や既存コードへの影響調査を AI と対話しながら行います。


2. **`/kiro-spec-init <やりたいこと>` (初期化)**
* 例: `/kiro-spec-init ユーザー一覧画面と検索機能の追加`
* 新規機能用の仕様ディレクトリ（`docs/specs/[spec-id]/`）が生成されます。


3. **`/kiro-spec-requirements` (要件定義)**
* 自然言語の要望から EARS 形式で整理された `requirements.md` を生成します。生成結果を人間がレビューし、問題がなければ承認して次へ進みます。


4. **`/kiro-spec-design` (技術設計)**
* データモデル変更、コンポーネント構成、影響範囲、テスト方針を記述した `design.md` を生成します。


5. **`/kiro-spec-tasks` (タスク分解)**
* 実装手順を 1〜3 時間程度で完了できる小さなタスク（`tasks.md`）に分解します。


6. **`/kiro-impl` (TDD 自律実装)**
* 分割されたタスクに沿って、AI が **「Vitest テスト作成 ➔ パスするコード実装 ➔ ESLint / Prettier チェック」** を自律的に実行します。



---

## 4. 注意点 & ナレッジ

* **人間による承認（Phase Gate）の重要性**
* AI が生成した各ドキュメント（`requirements.md`, `design.md`, `tasks.md`）は必ず目を通し、期待通りの内容になっているか確認してください。承認なしで実装に進むと大きな手戻りの原因となります。


* **`docs/` ディレクトリの Git 管理**
* 生成された仕様ファイル（`docs/specs/`）やステアリング文書（`docs/steering/`）は **Git リポジトリにコミットすることを推奨**します。設計背景や歴史的経緯が残るため、チーム開発でのコードレビューや将来の保守が非常に容易になります。



---

## 5. 関連リンク & 参考資料

* 📦 **GitHub Repository**: [gimmyzz/cc-sdd](https://www.google.com/search?q=https://github.com/gimmyzz/cc-sdd) — ソースコードおよび最新リリース
* 🚚 **npm Package**: [cc-sdd](https://www.google.com/search?q=https://www.npmjs.com/package/cc-sdd) — パッケージ情報および CLI オプション一覧