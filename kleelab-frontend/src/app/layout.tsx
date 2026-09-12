import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * Three type roles, each doing one job.
 *
 * - Newsreader is the display face. It was drawn for reading newspapers, so it
 *   stays legible at large sizes while carrying more warmth than a didone - which
 *   suits "we build cute, secure digital products" better than a cold elegance.
 * - Inter carries body and interface copy, where neutrality is the goal.
 * - IBM Plex Mono marks anything that is a label, an eyebrow or a piece of data,
 *   echoing the measurement-and-coordinates language of a design tool.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://kleelab.com"),
  title: {
    default: "KleeLab — we build cute, secure digital products",
    template: "%s · KleeLab",
  },
  description:
    "KleeLab is a small studio that designs and builds websites and digital products. Start with our builder, or have us build it for you.",
  openGraph: {
    type: "website",
    siteName: "KleeLab",
    title: "KleeLab — we build cute, secure digital products",
    description:
      "A small studio that designs and builds websites and digital products. Start with our builder, or have us build it for you.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
