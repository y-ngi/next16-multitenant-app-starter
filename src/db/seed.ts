import { config } from "dotenv";
import { db } from "./index";
import { users, organizations, memberships } from "./schema";

config({ path: ".env.local" });

async function main() {
  console.log("🌱 初期データの投入を開始します...");

  // 1. テストユーザーの作成
  const [user] = await db
    .insert(users)
    .values({
      name: "テストユーザー",
      email: "test@example.com",
    })
    .returning();

  // 2. テスト組織（テナント）の作成
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Acme Corp",
      slug: "acme-corp",
    })
    .returning();

  // 3. メンバーシップの紐付け
  await db.insert(memberships).values({
    userId: user.id,
    organizationId: org.id,
    role: "admin",
  });

  console.log("✅ 初期データの投入が完了しました！");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ シード実行エラー:", err);
  process.exit(1);
});
