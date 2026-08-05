import type { Metadata } from "next";
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
  title: {
    default: "Fourteen — say it safely",
    template: "%s · Fourteen",
  },
  description:
    "An anonymous crush app for University of Michigan students, built around consent.",
  applicationName: "Fourteen",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fourteen",
  },
};

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
