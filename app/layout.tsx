import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content engine for certify360",
  description: "Structured content generation for Certify360",
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
