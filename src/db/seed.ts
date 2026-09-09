import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { user } from './schema';
import { auth } from '../lib/auth';

config({ path: '.env.local' });

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'Password123!';

async function main() {
  console.log('🌱 初期データの投入を開始します...');

  // 再実行時に重複しないよう、既存のテストユーザーを削除しておく
  // (account/session/twoFactor は user への外部キーで onDelete: cascade 設定済み)
  await db.delete(user).where(eq(user.email, TEST_EMAIL));

  // better-auth の API 経由でユーザーを作成する
  // (パスワードのハッシュ化や twoFactorEnabled を強制する databaseHooks が適用される)
  await auth.api.signUpEmail({
    body: {
      name: 'テストユーザー',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  // requireEmailVerification が有効なため、動作確認しやすいよう検証済みにしておく
  // (本来はサインアップ時に送信されるメール内リンクのクリックで検証される)
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, TEST_EMAIL));

  console.log('✅ 初期データの投入が完了しました！');
  console.log(`   email: ${TEST_EMAIL}`);
  console.log(`   password: ${TEST_PASSWORD}`);
  console.log(`   ※ 2FA が有効なため、ログイン時に認証コード入力が必要です（Mailpit を確認してください）`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ シード実行エラー:', err);
  process.exit(1);
});
