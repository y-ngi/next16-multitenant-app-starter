# 🎨 Prettier（フォーマッター）の導入手順

## 1. パッケージのインストール

Prettier 本体、ESLint とのルール競合を防ぐ `eslint-config-prettier`、および Tailwind CSS のクラス自動整列用プラグインをインストールします。

```bash
pnpm add -D prettier eslint-config-prettier prettier-plugin-tailwindcss

```

---

## 2. 設定ファイルの作成

### ① `.prettierrc` の作成（フォーマットルールの定義）

プロジェクトルートに `.prettierrc`（JSON 形式）を作成します。TypeScript / Next.js (App Router) および Tailwind CSS に最適化した設定です。

`.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "jsxSingleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}

```

### ② `.prettierignore` の作成（対象外ファイルの設定）

ビルド成果物、`shadcn/ui` の生成コンポーネント、および Markdown ファイルを整形対象から除外します。

`.prettierignore`

```gitignore
.next/
coverage/
node_modules/
out/
build/
pnpm-lock.yaml

# shadcn/ui のコンポーネントを除外 (公式コードの保持)
src/components/ui/
components/ui/

# すべての Markdown ファイルを除外 (手動レイアウトの保持)
*.md
**/*.md

```

---

## 3. `eslint.config.mjs` の修正（ESLint との競合防止）

ESLint 側のフォーマット関連ルールを無効化し、見栄えの整形をすべて Prettier に委ねるため、`eslint-config-prettier` を `eslint.config.mjs` の末尾に追加します。

`eslint.config.mjs`

```javascript
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // テストファイル限定で any の警告をオフに設定
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["coverage/**", ".next/**", "out/**", "node_modules/**"],
  },
  eslintConfigPrettier, // 👈 配列の最後に配置して競合ルールを無効化
];

```

---

## 4. `package.json` にスクリプトを追加

`package.json`（抜粋）

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",       // 👈 全ファイルを自動整形
    "format:check": "prettier --check .", // 👈 CI等で整形漏れがないかチェック
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }

```

---

## 5. 実行確認

以下のコマンドを実行すると、プロジェクト全体の全コードが一括で美しく整形され、Tailwind CSS のクラス名も標準順序に自動ソートされます。

```bash
pnpm format

```

> **ヒント (VS Code をお使いの場合)**
> 拡張機能「Prettier - Code formatter」を入れ、VS Code の `settings.json` に `"editor.formatOnSave": true` を設定しておくと、**ファイルを保存（Ctrl+S / Cmd+S）するたびに自動でキレイに一瞬で成形**されるようになり、開発体験が飛躍的に上がります。