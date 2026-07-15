import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agentflow.one"),
  title: "AgentFlow | AI agents that research, decide, and execute on Arc",
  description:
    "One chat runs an economy of paid agents for research, DeFi, prediction markets, and payments, with previews, USDC settlement, and onchain reputation.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "AgentFlow | AI agents that research, decide, and execute on Arc",
    description:
      "One chat runs an economy of paid agents for research, DeFi, prediction markets, and payments, with previews, USDC settlement, and onchain reputation.",
    url: "https://www.agentflow.one/",
    siteName: "AgentFlow",
    type: "website",
    images: [{ url: "/agentflow-logo-square.png", width: 512, height: 512, alt: "AgentFlow" }],
  },
  twitter: {
    card: "summary",
    title: "AgentFlow | AI agents that research, decide, and execute on Arc",
    description:
      "One chat runs an economy of paid agents for research, DeFi, prediction markets, and payments, with previews, USDC settlement, and onchain reputation.",
    images: ["/agentflow-logo-square.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Material Symbols is not available via next/font; ligature icons need this stylesheet. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
