# 🧹 ESLint (Flat Config) 導入・設定手順書

本手順書では、Next.js (App Router) プロジェクトにおいて ESLint 9 (Flat Config / `eslint.config.mjs`) を使用し、コード品質の維持、`coverage/` 等の不要ファイルの除外設定、および自動修復スクリプトを構築する手順を解説します。

---

## 1. 必要なパッケージのインストール

ESLint 9 ネイティブの Flat Config 設定および TypeScript / Next.js / Vitest 用のプラグインをインストールします。

```bash
pnpm add -D @next/eslint-plugin-next @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-vitest

```

---

## 2. 設定ファイル (`eslint.config.mjs`) の作成・更新

プロジェクトルートの `eslint.config.mjs` を以下のように記述します。

`eslint.config.mjs`

```javascript
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vitestPlugin from "eslint-plugin-vitest";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // 対象ファイルとパーサー・プラグインの設定
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      vitest: vitestPlugin,
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
      ...vitestPlugin.configs.recommended.rules,
      // 必要に応じてルールの調整
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // テスト生成物やビルド出力を除外する設定
    ignores: ["coverage/**", ".next/**", "out/**", "node_modules/**"],
  },
];
```

---

## 3. `package.json` スクリプトの調整

`next lint` コマンドは `--fix` オプションを直接サポートしないため、自動修正スクリプトには `eslint . --fix` を指定します。

`package.json`（抜粋）

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "eslint . --fix",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }

```

---

## 4. リンターの実行確認

### ① チェックの実行

コードのリンターチェックを行います。

```bash
pnpm lint

```

### ② 自動修正の実行

フォーマットエラーや修復可能な構文エラーを自動修正します。

```bash
pnpm lint:fix

```

---

## 5. ESLint 導入のメリット

1. **Next.js & React 19 のアンチパターン検知**
   `<Image>` コンポーネントの推奨利用や、`useEffect` 内での同期的な `setState` による不要な再レンダリングの警告などを未然に防ぎます。
2. **TypeScript の型安全性**
   `any` 型の多用や未参照の変数を自動検出します。
3. **テストコードのアンチパターン防止**
   Vitest での `expect(...)` の評価漏れなど、テスト時の記述ミスをエディタ上でリアルタイムに検知します。
