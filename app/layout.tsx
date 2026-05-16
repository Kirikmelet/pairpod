import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Uncommon Hacks",
  description: "Social-impact browser extension and web app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
