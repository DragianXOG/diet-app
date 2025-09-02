import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pw2Err, setPw2Err] = useState("");
  const [loading, setLoading] = useState(false);

  const base = useMemo(() => {
    const p = new URLSearchParams(location.search).get("api");
    return p || localStorage.getItem("diet.app.base") || `${location.protocol}//${location.hostname}:8010`;
  }, []);
  const COMMON_WEAK = new Set([
    "password","123456","qwerty","letmein","111111","iloveyou","admin","welcome",
    "abc123","monkey","dragon","123456789","12345678","000000"
  ]);

  function pwIssuesJS(pass, mail) {
    const issues = [];
    const pw = String(pass || "");
    const local = String(mail || "").split("@")[0]?.toLowerCase() || "";
    if (pw.length < 12) issues.push("At least 12 characters");
    if (!/[a-z]/.test(pw)) issues.push("Contains a lowercase letter");
    if (!/[A-Z]/.test(pw)) issues.push("Contains an uppercase letter");
    if (!/\d/.test(pw)) issues.push("Contains a number");
    if (!/[^A-Za-z0-9]/.test(pw)) issues.push("Contains a symbol");
    if (/(.)\1\1/.test(pw)) issues.push("No character repeated 3+ times in a row");
    if (local && pw.toLowerCase().includes(local)) issues.push("Does not include your email name");
    if (COMMON_WEAK.has(pw.toLowerCase())) issues.push("Not a common password");
    return issues;
  }

  const issues = useMemo(() => pwIssuesJS(pw, email), [pw, email]);
  const matches = pw.length > 0 && pw === pw2;
  const canSubmit = !!email && !!pw && !!pw2 && matches && issues.length === 0 && !loading;

  async function submit() {
    setErr("");
    setEmailErr("");
    setPwErr("");
    setPw2Err("");
    if (!canSubmit) {
      if (!matches) setPw2Err("Passwords do not match.");
      if (issues.length) setPwErr("Password doesn't meet requirements.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: pw }),
      });
      const t = await res.text(); let j=null; try{ j= t? JSON.parse(t): null;}catch{}
      if (!res.ok) {
        // Handle 409 (email exists)
        if (res.status === 409) {
          const msg = (j && (j.detail || j.error)) || 'Email already registered';
          setEmailErr(String(msg));
          throw new Error(String(msg));
        }
        // Handle 422 validation errors
        if (res.status === 422 && j && Array.isArray(j.detail)) {
          for (const d of j.detail) {
            const loc = Array.isArray(d.loc) ? d.loc : [];
            const field = String(loc[loc.length - 1] || '').toLowerCase();
            const msg = d.msg || d.message || 'Invalid value';
            if (field === 'email') setEmailErr(String(msg));
            if (field === 'password') setPwErr(String(msg).replace(/^Value error,\s*/i, ''));
          }
          throw new Error('Please fix the highlighted fields.');
        }
        // Fallback: show generic error
        throw new Error((j && (j.detail || j.error)) || res.statusText);
      }
      localStorage.setItem("diet.app.base", base);
      window.dispatchEvent(new CustomEvent("diet.base", { detail: base }));
      nav('/app?tab=about');
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Register</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e)=>{ setEmail(e.target.value); setEmailErr(""); }} placeholder="you@example.com" />
            {emailErr && <div className="text-red-600 text-sm">{emailErr}</div>}
          </div>
          <div className="grid gap-1">
            <Label>Password</Label>
            <Input type="password" value={pw} onChange={(e)=>{ setPw(e.target.value); setPwErr(""); }} placeholder="••••••••••••" />
            {pwErr && <div className="text-red-600 text-sm">{pwErr}</div>}
          </div>
          <div className="grid gap-1">
            <Label>Confirm password</Label>
            <Input type="password" value={pw2} onChange={(e)=>{ setPw2(e.target.value); setPw2Err(""); }} placeholder="••••••••••••" />
            {(!matches && pw2.length > 0) && <div className="text-red-600 text-sm mt-1">Passwords do not match.</div>}
            {pw2Err && <div className="text-red-600 text-sm">{pw2Err}</div>}
          </div>
          <div className="rounded-xl border p-3 bg-muted/40">
            <div className="text-sm font-medium mb-1">Password requirements</div>
            <ul className="text-sm space-y-1">
              {[
                { key:"len",     label:"At least 12 characters",                      pass: pw.length >= 12 },
                { key:"lower",   label:"Contains a lowercase letter",                  pass: /[a-z]/.test(pw) },
                { key:"upper",   label:"Contains an uppercase letter",                 pass: /[A-Z]/.test(pw) },
                { key:"num",     label:"Contains a number",                            pass: /\d/.test(pw) },
                { key:"sym",     label:"Contains a symbol",                            pass: /[^A-Za-z0-9]/.test(pw) },
                { key:"repeat",  label:"No character repeated 3+ times in a row",      pass: !/(.)\1\1/.test(pw) },
                { key:"emailnm", label:"Does not include your email name",             pass: !(email && pw.toLowerCase().includes(email.split("@")[0]?.toLowerCase()||"")) },
                { key:"common",  label:"Not a common password",                        pass: !COMMON_WEAK.has(pw.toLowerCase()) },
              ].map(r => (
                <li key={r.key} className={r.pass ? "text-[#48A860]" : "text-muted-foreground"}>
                  {r.pass ? "✔" : "•"} {r.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-3">
            <Button onClick={submit} disabled={!canSubmit}>
              {loading ? <span className="animate-spin mr-2">⏳</span> : null}
              Create account
            </Button>
            <Button variant="ghost" type="button" onClick={()=>nav("/login")}>
              I already have an account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
