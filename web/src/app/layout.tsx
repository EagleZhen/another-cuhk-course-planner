import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from "@vercel/speed-insights/next"
import FeedbackButton from '@/components/FeedbackButton'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Another CUHK Course Planner",
  description: "A CUHK course planner that actually makes sense! Visual weekly calendar, smart conflict detection, and easy section swapping.",

  // Open Graph (Facebook, WhatsApp, Discord, Instagram, etc.)
  openGraph: {
    title: "Another CUHK Course Planner",
    description: "A CUHK course planner that actually makes sense! Visual weekly calendar, smart conflict detection, and easy section swapping.",
    url: "https://another-cuhk-course-planner.vercel.app",
    siteName: "Another CUHK Course Planner",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CUHK Course Planner - Weekly calendar and shopping cart interface showing course scheduling with conflict detection",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  
  // Twitter Card (X, Threads)
  twitter: {
    card: "summary_large_image",
    title: "Another CUHK Course Planner",
    description: "A CUHK course planner that actually makes sense! Visual weekly calendar, smart conflict detection, and easy section swapping.",
    images: ["/og-image.png"],
  },

  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Data Source Notice */}
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-4">
          <span>Data regularly synced from </span>
          <a 
            href="http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-amber-900 font-medium"
          >
            the official course catalog
          </a>
          <span>. </span>
          <span className="font-semibold">Always verify in </span>
          <a 
            href="https://cusis.cuhk.edu.hk/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-amber-900 font-bold"
          >
            CUSIS
          </a>
          <span className="font-semibold"> before enrolling.</span>
        </div>
        {children}
        <FeedbackButton />
        <Analytics/>
        <SpeedInsights/>
      </body>
    </html>
  );
}
