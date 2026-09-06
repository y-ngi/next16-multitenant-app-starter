import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-8 px-6">
      <div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-600">Next 16 starter</p>
        <h1 className="text-4xl font-bold tracking-tight">マルチテナント型アプリケーション</h1>
        <p className="mt-4 max-w-2xl text-slate-600">組織ごとの権限と個人機能を備えた SaaS のためのベース基盤です。</p>
      </div>
      <nav className="flex gap-3">
        <Link className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white" href="/app">一般ユーザー</Link>
        <Link className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium" href="/admin">管理者</Link>
      </nav>
    </main>
  );
}
