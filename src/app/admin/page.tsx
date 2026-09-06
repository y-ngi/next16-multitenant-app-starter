export default function AdminPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold">管理者ポータル</h1>
      <p className="mt-3 text-slate-600">システム管理者・サービス運営者向けの領域です。</p>
      <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        チームに所属していない場合は、管理者から招待を受けるまでお待ちください。
      </p>
    </main>
  );
}
