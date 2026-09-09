# 🧪 Vitest + React Testing Library 導入手順書

本手順書では、Next.js (App Router) プロジェクトに Vitest、React Testing Library、jsdom、V8 Coverage を導入し、テストファイルを実装コードと同じ階層（コロケーション方式）に配置する TDD 環境を構築する手順を解説します。

---

## 1. 必要なパッケージのインストール

テストランナー、DOM エミュレータ、React 用アサーションライブラリ、およびカバレッジ計測ツールをインストールします。

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @vitest/coverage-v8

```

---

## 2. ディレクトリ構造とファイル配置

テストコードは実装ファイルと同じディレクトリに配置（コロケーション）し、セットアップファイルは `./tests/` ディレクトリに配置します。

```text
.
├── src/
│   ├── lib/
│   │   ├── validators.ts
│   │   └── validators.test.ts  # 実装のすぐ隣に配置
│   └── components/ui/
│       ├── button.tsx
│       └── button.test.tsx     # 実装のすぐ隣に配置
├── tests/
│   └── vitest.setup.ts         # テスト初期化ファイル
├── vitest.config.ts
└── package.json

```

---

## 3. 設定ファイルの作成

### ① `vitest.config.ts` の作成

プロジェクトルートに設定ファイルを作成します。`include` で `src` 以下のテストファイルを指定し、カバレッジ計測の設定を追加します。

`vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/vitest.setup.ts"], // セットアップファイルのパスを指定
    include: ["src/**/*.{test,spec}.{ts,tsx}"], // テストファイルの探索範囲を src 配下に指定
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.d.ts",
        "**/*.config.*",
        "src/db/schema.ts",
      ],
    },
  },
});

```

### ② `tests/vitest.setup.ts` の作成

`tests` ディレクトリを作成し、その中にテスト実行前に読み込まれるセットアップファイルを作成します。ここで `jest-dom` の拡張マッチャーを有効化します。

`tests/vitest.setup.ts`

```typescript
import "@testing-library/jest-dom";

```

### ③ `package.json` のスクリプト追加

`package.json` の `"scripts"` にテスト用とカバレッジ計測用のコマンドを追加します。

`package.json`（抜粋）

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",                  // 監視モードでテストを実行（TDD用）
    "test:run": "vitest run",          // CI等で1回だけ実行
    "test:coverage": "vitest run --coverage", // カバレッジ出力
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "db:reset": "pnpm db:push --force && pnpm db:seed"
  }

```

---

## 4. 動作確認・TDD 実践例 (コロケーション方式)

### ① ロジックの TDD 実践例

例として、入力値のバリデーション関数を作成します。

#### 1. テストを作成（Red 🔴）

実装コードと同じディレクトリにテストファイルを作成します。

`src/lib/validators.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { isValidEmail } from "./validators"; // 同じ階層からのインポート

describe("isValidEmail", () => {
  it("正しいメールアドレス形式の場合は true を返すこと", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("不正なメールアドレス形式の場合は false を返すこと", () => {
    expect(isValidEmail("invalid-email")).toBe(false);
  });
});

```

ターミナルでテストを実行します。

```bash
pnpm test

```

> **判定**: `isValidEmail` が存在しないためテストは失敗します（Red）。

#### 2. 最小限の実装（Green 🟢）

テストを通過させるコードを実装します。

`src/lib/validators.ts`

```typescript
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

```

> **判定**: 自動再実行され、テストが成功します（Green）。

---

### ② UI コンポーネントの TDD 実践例

例として、ローディング状態を持つボタンコンポーネントをテストします。

#### 1. テストを作成（Red 🔴）

`src/components/ui/button.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";

describe("Button Component", () => {
  it("指定したテキストが描画されること", () => {
    render(<Button>送信</Button>);
    expect(screen.getByRole("button", { name: "送信" })).toBeInTheDocument();
  });

  it("disabled 属性が渡された場合、非活性化されること", () => {
    render(<Button disabled>送信</Button>);
    expect(screen.getByRole("button", { name: "送信" })).toBeDisabled();
  });
});

```

#### 2. コンポーネントの実装・確認（Green 🟢）

既存の `shadcn/ui` ボタンコンポーネント等が存在する場合、そのままテストが通過（Green）することを確認します。

---

## 5. テスト実行コマンドのまとめ

* **`pnpm test`**: 監視モード（Watch Mode）でテストを起動します。ファイルを保存するたびに自動で再テストが走り、TDD のサイクル（Red / Green）を回すのに適しています。
* **`pnpm test:run`**: 全テストを 1 回だけ実行して終了します。
* **`pnpm test:coverage`**: カバレッジレポートを生成し、ターミナル出力および `./coverage/index.html` に HTML レポートを保存します。