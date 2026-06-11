import type { Metadata } from "next";
import { CollageProvider } from "@/src/components/CollageContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kollázskészítő",
  description: "Kollázskészítő",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {/* A CollageProvider megjegyzi a képeket oldalváltáskor is! */}
        <CollageProvider>
          {children}
        </CollageProvider>
      </body>
    </html>
  );
}