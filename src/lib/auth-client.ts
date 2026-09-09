import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [
    // twoFactorPage オプションを削除（自動リダイレクトを停止し、AuthForm 内の State で画面を保持する）
    twoFactorClient(),
  ],
});

export const { useSession, signIn, signUp, signOut, twoFactor } = authClient;
