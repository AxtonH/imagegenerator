"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { api, getRememberedEmail, getToken, setRememberedEmail, setToken, shouldRememberLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    setEmail(getRememberedEmail());
    setRemember(shouldRememberLogin());

    if (!getToken()) {
      setCheckingSession(false);
      return;
    }

    api.me()
      .then(() => router.replace("/generate"))
      .catch(() => setCheckingSession(false));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.login(email, password);
      setToken(result.access_token, remember);
      setRememberedEmail(email, remember);
      router.replace("/generate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand">Prezlab</div>
        <p className="brand-sub">Internal image generation</p>
        {checkingSession ? <p className="muted">Checking saved login...</p> : null}
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Odoo email</label>
            <input className="input" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Odoo password</label>
            <input className="input" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <label className="checkbox-row" htmlFor="remember">
            <input id="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
            <span>Remember this device and open Generate next time</span>
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="primary-button" disabled={loading || checkingSession} type="submit">
            <LogIn size={18} />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
