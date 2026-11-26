import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Cairo Verre | Atelier",
  description: "Gestion d'atelier et devis — Cairo Verre, Mediouna.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/pwa-icon.svg",
    shortcut: "/pwa-icon.svg",
    apple: "/pwa-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cairo Verre",
  },
};

export const viewport: Viewport = {
  themeColor: "#17324f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}<PWARegister /></body></html>;
}
