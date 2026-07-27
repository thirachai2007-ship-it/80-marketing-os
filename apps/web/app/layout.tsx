import type { Metadata } from "next";
import {
  Space_Grotesk,
  Plus_Jakarta_Sans,
  Geist_Mono,
  Anuphan,
} from "next/font/google";

import "./globals.css";

const logoFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-logo",
  weight: ["700"],
});

const uiFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
});

const thaiFont = Anuphan({
  subsets: ["thai", "latin"],
  variable: "--font-thai",
  weight: ["300", "400", "500", "600", "700"],
});

const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "80 AI OS",
  description: "Business Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`
        ${logoFont.variable}
        ${uiFont.variable}
        ${thaiFont.variable}
        ${monoFont.variable}
      `}
    >
      <body>{children}</body>
    </html>
  );
}