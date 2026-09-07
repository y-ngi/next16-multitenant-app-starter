`src/app/dashboard/page.tsx` での表示確認まで無事に完了しましたね！

今回の `shadcn/ui` 初期化およびダッシュボード Block 導入の完全な手順を Markdown 形式でまとめました。

---

# 🚀 shadcn/ui 導入手順書

## 1. shadcn/ui の初期化

対話式コマンドを実行します。

```bash
pnpm dlx shadcn@latest init

```

プロンプトが表示されたら、以下を選択します。

* **Select a component library**:
👉 **`Radix UI`**
* **Which preset would you like to use?**:
👉 **`Sera`**（`Noto Sans` による日本語の読みやすさを確保）

---

## 2. サイドバーおよびダッシュボード Block の追加

### ① サイドバーコンポーネントの追加

```bash
pnpm dlx shadcn@latest add sidebar

```

### ② ダッシュボード Block (dashboard-01) の追加

```bash
npx shadcn@latest add dashboard-01

```

> **Note**: もしレジストリパス未定義エラー等が出た場合は、以下の URL 直接指定コマンドを実行します。
> ```bash
> pnpm dlx shadcn@latest add "https://ui.shadcn.com/r/styles/default/dashboard-01.json"
> 
> ```
> 
> 

---

## 3. ダッシュボードページの作成と Block の呼び出し

追加された Block を表示するために、`src/app/dashboard/page.tsx` を作成して以下のように記述します。

`src/app/dashboard/page.tsx`

```tsx
import Component from "@/components/dashboard-01"

export default function DashboardPage() {
  return <Component />
}

```

---

## 4. 動作確認

開発サーバーを起動し、ブラウザで表示を確認します。

```bash
pnpm dev

```

[http://localhost:3000/dashboard](http://localhost:3000/dashboard) にアクセスし、ダッシュボード UI が正常に描画されていることを確認します。

---
