"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(error => {
        console.error("Cairo Verre service worker registration failed:", error);
      });
    }
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setShowInstall(true);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowInstall(false);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!showInstall || !installPrompt) return null;
  return (
    <aside style={{ position: "fixed", zIndex: 1200, left: 16, right: 16, bottom: 16, maxWidth: 520, margin: "0 auto", padding: 14, borderRadius: 14, background: "#17324f", color: "#fff", boxShadow: "0 12px 40px rgba(10,30,50,.24)", display: "flex", alignItems: "center", gap: 12 }}>
      <img src="/pwa-icon.svg" alt="" width="38" height="38" style={{ borderRadius: 9 }} />
      <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 13 }}>Installer Cairo Verre</strong><span style={{ display: "block", opacity: .8, fontSize: 11, marginTop: 3 }}>Ajouter l’application à l’écran d’accueil</span></div>
      <button onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); setShowInstall(false); }} style={{ border: 0, borderRadius: 8, padding: "9px 12px", background: "#fff", color: "#17324f", fontWeight: 700, cursor: "pointer" }}>Installer</button>
      <button aria-label="Fermer" onClick={() => setShowInstall(false)} style={{ border: 0, background: "transparent", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
    </aside>
  );
}
