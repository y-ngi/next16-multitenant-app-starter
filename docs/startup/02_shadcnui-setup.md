その流れで進めましょう！Next.js 16 の準備はできているので、予定通り **1. shadcn/ui の導入** から順番に着手します。

---

## ステップ 1: shadcn/ui の初期化

Dev Container 内の統合ターミナルで以下の初期化コマンドを実行します。

```bash
pnpm dlx shadcn@latest init

```

実行するといくつかの設定質問が表示されます。今回のスタックに合わせて以下のように選択してください。

> **プロンプトの選択肢（推奨）:**
> * Which style would you like to use? → **Default**（または New York）
> * Which color would you like to use as base color? → **Slate**（お好みで Zinc や Neutral 等でも可）
> * Would you like to use CSS variables for colors? → **yes**
> 
> 

---

## ステップ 2: ダッシュボード（`dashboard-05`）用コンポーネントの導入

先ほど決定した `/org/[orgSlug]` 配下で使うダッシュボード UI ブロックと、共通サイドバーコンポーネントを一括追加します。

```bash
# 1. サイドバーコンポーネントの追加
pnpm dlx shadcn@latest add sidebar

# 2. dashboard-05 ブロックの追加
pnpm dlx shadcn@latest add dashboard-05

```

---

## ステップ 3: 動作確認用ページの作成

初期化が正常に完了したか確認するため、一時的に `src/app/page.tsx` で shadcn/ui のコンポーネントを表示してみます。

`src/app/page.tsx` を以下のように書き換えてみてください。

```tsx
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
          Next.js 16 Multitenant Starter
        </h1>
        <p className="text-muted-foreground text-lg">
          shadcn/ui の導入が正常に完了しました。
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Button>プライマリボタン</Button>
          <Button variant="outline">アウトラインボタン</Button>
        </div>
      </div>
    </main>
  );
}

```

---

## ステップ 4: 動作確認と Git コミット

1. 開発サーバーを起動（または起動中であることを確認）します。
```bash
pnpm dev

```


2. ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスし、デザインされたボタンが表示されているか確認します。
3. 問題なく表示できたら、Git にコミットしておきます。

```bash
git add .
git commit -m "feat: shadcn/ui の初期化および dashboard-05 / sidebar コンポーネントの導入"

```

---

ここまでのコマンド実行と動作確認はスムーズに完了できそうでしょうか？

完了しましたら、次の **2. Drizzle ORM のセットアップ** へ進みます！