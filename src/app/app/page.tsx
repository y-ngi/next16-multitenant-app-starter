export default function GeneralAppPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold">サービスダッシュボード</h1>
      <p className="mt-3 text-slate-600">組織の共有機能と、個人のお気に入りを管理できます。</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">組織機能</h2><p className="mt-2 text-sm text-slate-600">テナント共有データ</p></section>
        <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">個人機能</h2><p className="mt-2 text-sm text-slate-600">お気に入り・個人設定</p></section>
      </div>
    </main>
  );
}
