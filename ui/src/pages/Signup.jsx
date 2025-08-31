import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Shield } from "lucide-react";

function getBase() {
  try {
    const qs = new URLSearchParams(location.search).get("api");
    return localStorage.getItem("diet.app.base") || qs || `${location.protocol}//${location.hostname}:8010`;
  } catch { return `${location.protocol}//${location.hostname}:8010`; }
}

const commonBad = new Set([
  "password","123456","qwerty","letmein","111111","iloveyou","admin","welcome","abc123","monkey","dragon"
]);

function validatePassword(pw, email) {
  const emailLocal = (email || "").split("@")[0]?.toLowerCase() || "";
  const hasLen  = typeof pw === "string" && pw.length >= 12;
  const hasLow  = /[a-z]/.test(pw || "");
  const hasUp   = /[A-Z]/.test(pw || "");
  const hasNum  = /\d/.test(pw || "");
  const hasSpec = /[^A-Za-z0-9]/.test(pw || "");
  const noRepeat3 = !/(.)\1\1/.test(pw || "");
  const notEmailPart = emailLocal && pw ? !pw.toLowerCase().includes(emailLocal) : true;
  const notCommon = pw ? !commonBad.has(pw.toLowerCase()) : true;

  const all = [hasLen, hasLow, hasUp, hasNum, hasSpec, noRepeat3, notEmailPart, notCommon];
  const passed = all.every(Boolean);
  // Simple score for a meter (0-5)
  let score = 0;
  score += hasLen ? 1 : 0;
  score += hasLow ? 1 : 0;
  score += hasUp ? 1 : 0;
  score += hasNum ? 1 : 0;
  score += hasSpec ? 1 : 0;
  return { hasLen, hasLow, hasUp, hasNum, hasSpec, noRepeat3, notEmailPart, notCommon, passed, score };
}

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // If already authed, go straight to intake/app
    const tok = localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token");
    if (!tok) return;
    (async () => {
      const base = getBase();
      try {
        const r = await fetch(`${base}/api/v1/intake`, { headers: { Authorization: `Bearer ${tok}` }});
        const j = await r.json().catch(()=>null);
        if (r.ok && j) window.location.replace("/app");
        else window.location.replace("/intake");
      } catch {
        window.location.replace("/intake");
      }
    })();
  }, []);

  const v = useMemo(() => validatePassword(pw, email), [pw, email]);
  const match = pw && pw2 && pw === pw2;

  const canSubmit = email && v.passed && match && !busy;

  async function signup(e) {
    e?.preventDefault();
    setErr("");
    if (!canSubmit) return;
    setBusy(true);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email, password: pw })
      });
      const j = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(j.detail || j.error || res.statusText);
      const tok = j.access_token || j.token || j.accessToken;
      if (!tok) throw new Error("No access_token in response");

      localStorage.setItem("diet.app.token", tok);
      localStorage.setItem("diet.token", tok);
      localStorage.setItem("diet.app.base", getBase());
      window.dispatchEvent(new CustomEvent("diet.token", { detail: tok }));
      window.dispatchEvent(new CustomEvent("diet.base", { detail: getBase() }));

      // Go to intake to complete profile
      window.location.assign("/intake");
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  }

  function Row({ ok, children }) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        <span className={ok ? "" : "text-muted-foreground"}>{children}</span>
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-md p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5"/> Create your account</CardTitle>
          <CardDescription>Use a strong password. You’ll complete your intake next.</CardDescription>
        </CardHeader>
        <CardContent>
          {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
          <form className="grid gap-4" onSubmit={signup} noValidate>
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="grid gap-1">
              <Label>Password</Label>
              <Input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 12 characters" required />
              {/* Simple strength meter */}
              <div className="h-1 rounded bg-muted overflow-hidden">
                <div
                  className="h-1"
                  style={{
                    width: `${(v.score/5)*100}%`,
                    background: v.score <=2 ? "#ef4444" : v.score===3 ? "#f59e0b" : "#10b981"
                  }}
                />
              </div>
              <div className="grid gap-1 mt-2">
                <Row ok={v.hasLen}>At least 12 characters</Row>
                <Row ok={v.hasLow}>Contains a lowercase letter (a–z)</Row>
                <Row ok={v.hasUp}>Contains an uppercase letter (A–Z)</Row>
                <Row ok={v.hasNum}>Contains a number (0–9)</Row>
                <Row ok={v.hasSpec}>Contains a symbol (!@#$…)</Row>
                <Row ok={v.noRepeat3}>No character repeated 3+ times in a row</Row>
                <Row ok={v.notEmailPart}>Does not include your email name</Row>
                <Row ok={v.notCommon}>Not a common password</Row>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Confirm password</Label>
              <Input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="Re-enter your password" required />
              {!match && pw2 && <div className="text-xs text-red-600 mt-1">Passwords do not match.</div>}
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={!canSubmit}>{busy ? "Creating..." : "Create account"}</Button>
              <Button type="button" onClick={() => nav("/login")}>I already have an account</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}