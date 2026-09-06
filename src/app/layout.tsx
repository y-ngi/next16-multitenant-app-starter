import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multitenant App Starter",
  description: "Next.js 16 multitenant SaaS starter",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
