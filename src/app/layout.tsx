import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reboot01 GraphQL Dashboard",
  description: "Profile dashboard that uses Reboot01 GraphQL live data.",
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
