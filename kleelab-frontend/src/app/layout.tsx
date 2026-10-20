import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

/**
 * Three type roles.
 *
 * - Bricolage Grotesque is the display face: heavy, tight and a little quirky,
 *   which carries the playful half of the brand.
 * - Instrument Sans carries body and interface copy.
 * - JetBrains Mono marks labels, references and dimensions: the technical half.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '700', '800'],
});

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const TITLE = 'KleeLab: websites and systems, built in the open';
const DESCRIPTION =
  'KleeLab designs and builds websites, web apps and internal systems for organisations and businesses. You follow every step on your own dashboard, then we deploy, host and look after it if you want us to.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kleelab.com'),
  title: {
    default: TITLE,
    template: '%s · KleeLab',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'KleeLab',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        {children}
        {/* Thravic traffic analytics. */}
        <Script
          id="thravic"
          src="https://thravic.onrender.com/tf.js"
          strategy="afterInteractive"
          data-tracking-id="TF-2083C319"
        />
      </body>
    </html>
  );
}
