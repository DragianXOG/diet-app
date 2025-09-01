import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const tok = "";
export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
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

  const reqs = [
    { key:"len",     label:"At least 12 characters",                      pass: pw.length >= 12 },
    { key:"lower",   label:"Contains a lowercase letter",                  pass: /[a-z]/.test(pw) },
    { key:"upper",   label:"Contains an uppercase letter",                 pass: /[A-Z]/.test(pw) },
    { key:"num",     label:"Contains a number",                            pass: /\d/.test(pw) },
    { key:"sym",     label:"Contains a symbol",                            pass: /[^A-Za-z0-9]/.test(pw) },
    { key:"repeat",  label:"No character repeated 3+ times in a row",      pass: !/(.)\1\1/.test(pw) },
    { key:"emailnm", label:"Does not include your email name",             pass: !(email && pw.toLowerCase().includes(email.split("@")[0]?.toLowerCase()||"")) },
    { key:"common",  label:"Not a common password",                        pass: !COMMON_WEAK.has(pw.toLowerCase()) },
  ];

  async function create() {
    setErr("");
    if (!matches) { setErr("Passwords do not match."); return; }
    if (issues.length) { setErr("Password doesn't meet requirements."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) {
        let det = j?.detail;
        // Backend may return: {'error':'weak_password','issues':[...],'requirements':[...]}
        if (det && typeof det === "object") {
          if (Array.isArray(det.issues)) det = "Weak password: " + det.issues.join("; ");
          else det = JSON.stringify(det);
        }
        if (!det) det = r.statusText || "Signup failed";
        throw new Error(det);
      }
      const tok = j.access_token || j.token || j.accessToken;
      if (tok) {
        localStorage.setItem("diet.app.token", tok);
        localStorage.setItem("diet.token", tok);
      }
      localStorage.setItem("diet.app.base", base);
      window.dispatchEvent(new CustomEvent("diet.token", { detail: tok }));
      window.dispatchEvent(new CustomEvent("diet.base", { detail: base }));
      // Go to intake form as requested
      nav("/intake");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
          </div>

          <div className="grid gap-1">
            <Label>Password</Label>
            <Input type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="••••••••••••" />
          </div>

          <div className="grid gap-1">
            <Label>Confirm password</Label>
            <Input type="password" value={pw2} onChange={(e)=>setPw2(e.target.value)} placeholder="••••••••••••" />
            {!matches && pw2.length > 0 && (
              <div className="text-red-600 text-sm mt-1">Passwords do not match.</div>
            )}
          </div>

          <div className="rounded-xl border p-3 bg-muted/40">
            <div className="text-sm font-medium mb-1">Password requirements</div>
            <ul className="text-sm space-y-1">
              {reqs.map(r => (
                <li key={r.key} className={r.pass ? "text-[#48A860]" : "text-muted-foreground"}>
                  {r.pass ? "✔" : "•"} {r.label}
                </li>
              ))}
            </ul>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex gap-3">
            <Button onClick={create} disabled={!canSubmit}>
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
