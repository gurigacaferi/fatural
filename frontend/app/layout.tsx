import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fatural - AI Bill Scanner",
  description: "Multi-tenant AI-powered bill scanning for Kosovo market",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
