import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { SITE_URL } from '@/lib/site';
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

const TITLE = 'KleeLab: websites and systems, built where you can see them';
// Kept under ~155 characters: search results cut longer descriptions short.
const DESCRIPTION =
  'KleeLab designs and builds websites, web apps and internal systems. Follow every step on your own dashboard, then we can host and look after it.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  // Google Search Console proves ownership with this tag; set the env var to the code it gives you.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

/** Who runs the site, for search engines: the name and logo they show beside results. */
const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'KleeLab',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon.svg`,
      description: DESCRIPTION,
      // We work remotely, so search engines should not tie us to one country.
      areaServed: 'Worldwide',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'KleeLab',
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION).replace(/</g, '\\u003c') }} />
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
