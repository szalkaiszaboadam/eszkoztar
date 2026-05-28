import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eszköztár",
  description: "Belső eszközök",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}