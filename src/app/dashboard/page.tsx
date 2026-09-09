import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  // サーバーサイドでリクエストヘッダーからセッション情報を取得
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // 未ログインの場合はログイン画面へリダイレクト（保護ルートの制御）
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>ダッシュボード</CardTitle>
          <CardDescription>
            ログイン中のユーザーのみアクセスできる保護されたページです。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-background rounded-lg border space-y-2">
            <div>
              <span className="text-xs text-muted-foreground block">表示名</span>
              <span className="font-medium">{session.user.name}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">メールアドレス</span>
              <span className="font-medium">{session.user.email}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">ユーザーID</span>
              <span className="text-xs font-mono">{session.user.id}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

