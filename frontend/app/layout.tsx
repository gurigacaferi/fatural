import type { Metadata } from "next";
import { SessionProvider } from "@/hooks/useSession";
import { Toaster } from "sonner";
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
    <html lang="sq">
      <body>
        <SessionProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </SessionProvider>
      </body>
    </html>
  );
}
