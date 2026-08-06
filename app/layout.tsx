import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Fourteen — say it safely",
    template: "%s · Fourteen",
  },
  description:
    "An anonymous crush app for University of Michigan students, built around consent.",
  applicationName: "Fourteen",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Fourteen",
    title: "Fourteen at Michigan",
    description: "Someone has a crush on someone at Michigan.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fourteen at Michigan",
    description: "Someone has a crush on someone at Michigan.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fourteen",
  },
};

export const viewport: Viewport = { themeColor: "#14101B" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${fraunces.variable}`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
