import type { Metadata } from "next";
import { Nunito, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
  display: "swap",
});

const pixel = Pixelify_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Výprava",
    template: "%s · Výprava",
  },
  description:
    "Výprava – denné, týždenné, dlhodobé a spoločné survival ciele pre Paper server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sk"
      className={`${nunito.variable} ${pixel.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
