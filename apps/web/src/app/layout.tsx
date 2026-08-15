import type { Metadata } from "next";
import "@/styles/globals.css";
import { PwaRegistrar } from "@/components/pwa-registrar";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Koranco Farms",
  description: "Koranco Farms Digital Farm Management System",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistrar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
