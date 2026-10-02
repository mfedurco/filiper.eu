import type { Metadata } from "next";
import { Jersey_10, Nunito, Press_Start_2P, Silkscreen } from "next/font/google";
import "./globals.css";

const jersey = Jersey_10({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-jersey",
  display: "swap",
});

const silk = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-silk",
  display: "swap",
});

const press = Press_Start_2P({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-press",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
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
      className={`${jersey.variable} ${silk.variable} ${press.variable} ${nunito.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
