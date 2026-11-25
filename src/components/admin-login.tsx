"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError || !data.user) {
      setError(authError?.message || "Connexion impossible. Vérifiez vos identifiants.");
      setBusy(false);
      return;
    }
    if (data.user.app_metadata?.role !== "admin") {
      await supabase.auth.signOut();
      setError("Ce compte n’a pas l’autorisation d’accéder à Cairo Verre.");
      setBusy(false);
      return;
    }
    onAuthenticated();
    setBusy(false);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f3f5f7", fontFamily: "Arial, sans-serif", color: "#203040" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, padding: 32, borderRadius: 18, background: "#fff", boxShadow: "0 18px 60px rgba(22,40,58,.10)", border: "1px solid #e5eaf0" }}>
        <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 14, background: "#1d3448", color: "#fff", fontWeight: 800, letterSpacing: 1 }}>CV</div>
        <p style={{ margin: "24px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a98a6" }}>CAIRO VERRE · MEDIOUNA</p>
        <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Espace administrateur</h1>
        <p style={{ margin: "0 0 24px", color: "#718091", lineHeight: 1.5 }}>Connectez-vous avec votre adresse e-mail et votre mot de passe.</p>
        <label style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 700 }}>Adresse e-mail</label>
        <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@cairoverre.ma" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #d7e0e8", borderRadius: 9, marginBottom: 18, fontSize: 15 }} />
        <label style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 700 }}>Mot de passe</label>
        <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Votre mot de passe" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #d7e0e8", borderRadius: 9, marginBottom: 18, fontSize: 15 }} />
        {error && <p role="alert" style={{ color: "#b42318", background: "#fff1f0", padding: 11, borderRadius: 8, fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", border: 0, borderRadius: 9, padding: 14, color: "#fff", background: busy ? "#8292a0" : "#1d3448", fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <p style={{ margin: "18px 0 0", color: "#8a98a6", fontSize: 12, textAlign: "center" }}>Accès réservé aux administrateurs autorisés.</p>
      </form>
    </main>
  );
}
