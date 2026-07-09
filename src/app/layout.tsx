import type { Metadata } from 'next';
import { Cinzel_Decorative, Inter } from 'next/font/google';
import './globals.css';

const cinzelDeco = Cinzel_Decorative({
  variable: '--font-cinzel-deco',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: "Musical 'Das Wilde Weib' | Offizieller Ticketshop",
  description: 'Sichern Sie sich Ihre Plätze für das packende regionale Musical-Highlight "Das Wilde Weib". Interaktive Saalplanbuchung mit Echtzeit-Platzreservierung.',
  keywords: ['Musical', 'Das Wilde Weib', 'Ticketshop', 'Saalplanbuchung', 'Tickets', 'Karten', 'Kultur'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${cinzelDeco.variable} ${inter.variable}`}>
      <head>
        <meta name="theme-color" content="#120c1f" />
      </head>
      <body>{children}</body>
    </html>
  );
}
