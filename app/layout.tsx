import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// --- SEO CONFIGURATION ---
export const metadata: Metadata = {
  title: "FastDrop | Instant P2P Secure File Transfer",
  description:
    "Transfer files of any size directly between devices using secure WebRTC. No servers, no storage, 100% private and fast.",
  keywords: [
    "file transfer",
    "P2P sharing",
    "WebRTC",
    "FastDrop",
    "send large files",
    "secure file sharing",
    "no cloud storage",
  ],
  authors: [{ name: "Baroi AI", url: "https://github.com/baroi-ai" }],

  // OpenGraph (For Facebook, Discord, WhatsApp previews)
  openGraph: {
    title: "FastDrop | Secure P2P File Transfer",
    description:
      "Instant, private, and serverless file sharing directly between devices.",
    url: "https://baroi-ai.github.io/fast-drop/",
    siteName: "FastDrop",
    images: [
      {
        url: "/logo.png", // Make sure this is in your public folder
        width: 512,
        height: 512,
        alt: "FastDrop Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  // Twitter Card (For X/Twitter previews)
  twitter: {
    card: "summary_large_image",
    title: "FastDrop | Instant P2P File Transfer",
    description: "Send files directly to any device via secure WebRTC tunnel.",
    images: ["/logo.png"],
  },

  // Search Engine Behavior
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#00E585", // Your neon green branding color
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0d14]">{children}</body>
    </html>
  );
}
