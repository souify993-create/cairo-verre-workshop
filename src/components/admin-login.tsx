"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const ALLOWED_ADMIN_EMAILS = ["elmehdihariz@gmail.com", "harizelmehdi@gmail.com"];

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const normalizedEmail = email.trim().toLowerCase();
    if (mode === "signup") {
      if (!ALLOWED_ADMIN_EMAILS.includes(normalizedEmail)) {
        setError("Cette adresse e-mail ne figure pas dans la liste des administrateurs autorisés.");
        setBusy(false);
        return;
      }
      if (password.length < 8) {
        setError("Choisissez un mot de passe d’au moins 8 caractères.");
        setBusy(false);
        return;
      }
      if (password !== passwordConfirm) {
        setError("Les deux mots de passe ne correspondent pas.");
        setBusy(false);
        return;
      }
      const { data, error: signupError } = await createSupabaseBrowserClient().auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (signupError) {
        setError(signupError.message);
        setBusy(false);
        return;
      }
      if (data.session && data.user?.app_metadata?.role === "admin") {
        onAuthenticated();
      } else {
        setNotice("La demande de création du compte a été envoyée. Vérifiez votre boîte e-mail pour confirmer l’adresse, puis revenez vous connecter.");
        setMode("login");
        setPassword("");
        setPasswordConfirm("");
      }
      setBusy(false);
      return;
    }

    const { data, error: authError } = await createSupabaseBrowserClient().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (authError || !data.user) {
      setError(authError?.message || "Connexion impossible. Vérifiez vos identifiants.");
      setBusy(false);
      return;
    }
    if (data.user.app_metadata?.role !== "admin" || data.user.app_metadata?.application !== "cairo-verre") {
      await createSupabaseBrowserClient().auth.signOut();
      setError("Ce compte n’a pas l’autorisation d’accéder à Cairo Verre.");
      setBusy(false);
      return;
    }
    onAuthenticated();
    setBusy(false);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f3f5f7", fontFamily: "Arial, sans-serif", color: "#203040" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 440, padding: 32, borderRadius: 18, background: "#fff", boxShadow: "0 18px 60px rgba(22,40,58,.10)", border: "1px solid #e5eaf0" }}>
        <img src="/pwa-icon.svg" alt="Cairo Verre" style={{ width: 54, height: 54, borderRadius: 14 }} />
        <p style={{ margin: "22px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a98a6" }}>CAIRO VERRE · MEDIOUNA</p>
        <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>{mode === "login" ? "Espace administrateur" : "Activer votre compte"}</h1>
        <p style={{ margin: "0 0 22px", color: "#718091", lineHeight: 1.55 }}>{mode === "login" ? "Connectez-vous avec votre adresse e-mail et votre mot de passe." : "La création est réservée aux deux adresses préautorisées par le propriétaire."}</p>
        <label style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 700 }}>Adresse e-mail</label>
        <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@cairoverre.ma" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #d7e0e8", borderRadius: 9, marginBottom: 18, fontSize: 15 }} />
        <label style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 700 }}>Mot de passe</label>
        <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #d7e0e8", borderRadius: 9, marginBottom: 18, fontSize: 15 }} />
        {mode === "signup" && <>
          <label style={{ display: "block", marginBottom: 7, fontSize: 13, fontWeight: 700 }}>Confirmer le mot de passe</label>
          <input type="password" autoComplete="new-password" required minLength={8} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="Répétez le mot de passe" style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", border: "1px solid #d7e0e8", borderRadius: 9, marginBottom: 18, fontSize: 15 }} />
        </>}
        {error && <p role="alert" style={{ color: "#b42318", background: "#fff1f0", padding: 11, borderRadius: 8, fontSize: 13 }}>{error}</p>}
        {notice && <p role="status" style={{ color: "#176044", background: "#edf8f1", padding: 11, borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>{notice}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", border: 0, borderRadius: 9, padding: 14, color: "#fff", background: busy ? "#8292a0" : "#1d3448", fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Veuillez patienter…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice(""); }} style={{ width: "100%", marginTop: 12, border: "1px solid #d7e0e8", borderRadius: 9, padding: 12, color: "#1d3448", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {mode === "login" ? "Première connexion ? Activer mon compte" : "J’ai déjà un compte"}
        </button>
        <p style={{ margin: "18px 0 0", color: "#8a98a6", fontSize: 12, textAlign: "center" }}>Accès privé · Connexion sécurisée · Session persistante</p>
      </form>
    </main>
  );
}
