import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassFlow | Tuition learning, organized",
  description: "AI-powered learning management for modern tuition classes"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
