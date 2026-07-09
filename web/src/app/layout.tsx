import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import FeedbackButton from '@/components/FeedbackButton'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Shared metadata constants for better maintainability
const SITE_CONFIG = {
  name: 'Another CUHK Course Planner',
  description:
    'Interactive CUHK timetable planner with automatic conflict detection & easy resolution, fast course search, .ics export, and screenshot features.',
  url: 'https://another-cuhk-course-planner.com',
  ogImage: 'https://another-cuhk-course-planner.com/og-image.png',
  ogImageAlt:
    'CUHK Course Planner - Weekly calendar and shopping cart interface showing course scheduling with conflict detection',
} as const

export const metadata: Metadata = {
  title: SITE_CONFIG.name,
  description: SITE_CONFIG.description,

  // Open Graph (Facebook, WhatsApp, Discord, Instagram, etc.)
  openGraph: {
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
    siteName: SITE_CONFIG.name,
    images: [
      {
        url: SITE_CONFIG.ogImage,
        width: 1200,
        height: 630,
        alt: SITE_CONFIG.ogImageAlt,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // Twitter Card (X, Threads)
  twitter: {
    card: 'summary_large_image',
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    images: [SITE_CONFIG.ogImage],
  },

  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },

  other: {
    'application/ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
      url: SITE_CONFIG.url,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web Browser',
    }),
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <MobileDesktopNotice />
        <FeedbackButton />
      </body>
    </html>
  )
}
