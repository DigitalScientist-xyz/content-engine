import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whitepaper Factory",
  description: "Generate marketing whitepapers from course pages",
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
