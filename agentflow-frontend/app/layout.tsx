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
      // Google Search requires a square favicon that is a multiple of 48px.
      { url: "/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
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
    images: [{ url: "/media-kit/agentflow-logo-badge.svg", width: 256, height: 256, alt: "AgentFlow" }],
  },
  twitter: {
    card: "summary",
    title: "AgentFlow | AI agents that research, decide, and execute on Arc",
    description:
      "One chat runs an economy of paid agents for research, DeFi, prediction markets, and payments, with previews, USDC settlement, and onchain reputation.",
    images: ["/media-kit/agentflow-logo-badge.svg"],
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
