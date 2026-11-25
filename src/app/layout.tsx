import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cairo Verre | Atelier",
  description: "Gestion d'atelier et devis — Cairo Verre, Mediouna.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
