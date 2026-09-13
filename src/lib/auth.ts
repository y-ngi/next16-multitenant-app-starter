import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import nodemailer from 'nodemailer';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { processPendingInvitationsForUser } from '@/lib/organization-lifecycle';

// Mailpit 接続用 SMTP トランスポーター
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
});

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      ...schema,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // メールアドレス検証済みユーザーのみログインを許可
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    async sendVerificationEmail({ user, url }) {
      console.log(`[Email Verification] 送信試行先: ${user.email}`);
      console.log(`[Email Verification] 生成URL: ${url}`);

      try {
        const info = await transporter.sendMail({
          from: '"認証システム" <noreply@example.com>',
          to: user.email,
          subject: '【メールアドレスの確認】アカウント登録手続き',
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>メールアドレスの所有確認</h2>
              <p>${user.name} 様</p>
              <p>アカウントの作成を完了するため、以下のボタンをクリックしてメールアドレスを認証してください。</p>
              <p style="margin: 20px 0;">
                <a href="${url}" style="padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">
                  メールアドレスを検証する
                </a>
              </p>
            </div>
          `,
        });
        console.log(`[Email Verification] 送信成功:`, info.messageId);
      } catch (error) {
        console.error(`[Email Verification] メール送信失敗:`, error);
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        // 全ユーザーに 2FA を必須化
        async before(user) {
          return { data: { ...user, twoFactorEnabled: true } };
        },
        // Process pending invitations for newly registered user (Task 4.3)
        async after(user) {
          // Fire and forget - process invitations without blocking user creation
          processPendingInvitationsForUser(user.id, user.email).catch((error) => {
            console.error('[Auth Hook] Error processing pending invitations:', error);
          });
          return user;
        },
      },
    },
  },
  plugins: [
    twoFactor({
      otpOptions: {
        async sendOTP({ user, otp }) {
          await transporter.sendMail({
            from: '"認証システム" <noreply@example.com>',
            to: user.email,
            subject: '【ログイン認証コード】2段階認証のご案内',
            text: `あなたの 2FA 認証コードは ${otp} です。`,
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>ログイン用 2段階認証コード</h2>
                <p>以下の認証コードを画面に入力してください。</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #2563eb;">
                  ${otp}
                </p>
              </div>
            `,
          });
        },
      },
    }),
  ],
});
