import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}

async function tryLogin(base, email, password) {
  const candidates = [
    "/api/v1/auth/login",
    "/api/v1/auth/token",
    "/api/v1/auth/signin",
    "/login"
  ];
  const body = JSON.stringify({ email, password });
  for (const path of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body
      });
      const j = await res.json().catch(()=> ({}));
      if (!res.ok) continue;
      const tok = j.access_token || j.token || j.accessToken;
      if (!tok) continue;
      return tok;
    } catch {}
  }
  throw new Error("Login failed (no token).");
}

async function hasIntake(base, tok) {
  try {
    const r = await fetch(`${base}/api/v1/intake_open`);
    if (!r.ok) return false;
    const j = await r.json().catch(()=>null);
    return !!j;
  } catch { return false; }
}

const tok = "";
export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // If already authed, skip to intake/app
  useEffect(() => {
    if (!tok) return;
    (async () => {
      const base = getBase();
      if (await hasIntake(base, tok)) window.location.replace("/app");
      else window.location.replace("/intake");
    })();
  }, []);

  async function submit(e) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const base = getBase();
      const tok = await tryLogin(base, email, pw);
      localStorage.setItem("diet.app.token", tok);
      localStorage.setItem("diet.token", tok);
      localStorage.setItem("diet.app.base", base);
      window.dispatchEvent(new CustomEvent("diet.token", { detail: tok }));
      window.dispatchEvent(new CustomEvent("diet.base", { detail: base }));
      if (await hasIntake(base, tok)) window.location.assign("/app");
      else window.location.assign("/intake");
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto max-w-md p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Welcome back! Enter your credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="grid gap-1">
              <Label>Password</Label>
              <Input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={busy}>Login</Button>
              <Button type="button" onClick={()=>nav("/signup")}>Create account instead</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}