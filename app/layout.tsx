import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "ChiFree Radar | Free Chicago events worth attending",
    template: "%s | ChiFree Radar",
  },
  description: "Find Chicago’s best free events, pop-ups, giveaways, and appearances.",
  applicationName: "ChiFree Radar",
  keywords: ["free Chicago events", "Chicago pop-ups", "Chicago giveaways", "free things to do in Chicago"],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "ChiFree Radar",
    title: "ChiFree Radar",
    description: "Find Chicago’s best free events, pop-ups, giveaways, and appearances.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "ChiFree Radar over a Chicago map grid" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ChiFree Radar",
    description: "Find Chicago’s best free events, pop-ups, giveaways, and appearances.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f4ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
