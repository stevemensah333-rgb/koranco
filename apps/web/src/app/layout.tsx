import type { Metadata } from "next";
import "@/styles/globals.css";
import { PwaRegistrar } from "@/components/pwa-registrar";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Koranco Farms",
  description: "Koranco Farms Digital Farm Management System",
  manifest: "/manifest.webmanifest",
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
