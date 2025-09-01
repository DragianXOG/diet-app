import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);
  const expired = typeof window !== 'undefined' && new URLSearchParams(location.search).get('expired') === '1';

  async function submit(e){
    e?.preventDefault();
    setErr("");
    setEmailErr("");
    setPwErr("");
    if (!email) { setEmailErr("Email is required."); return; }
    if (!pw) { setPwErr("Password is required."); return; }
    try {
      setBusy(true);
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: pw }),
      });
      const t = await res.text(); let j=null; try{ j= t? JSON.parse(t): null;}catch{}
      if (!res.ok) {
        if (res.status === 401) {
          setPwErr("Invalid email or password.");
          throw new Error("Invalid email or password.");
        }
        if (res.status === 422 && j && Array.isArray(j.detail)) {
          for (const d of j.detail) {
            const loc = Array.isArray(d.loc) ? d.loc : [];
            const field = String(loc[loc.length - 1] || '').toLowerCase();
            const msg = d.msg || d.message || 'Invalid value';
            if (field === 'email') setEmailErr(String(msg));
            if (field === 'password') setPwErr(String(msg));
          }
          throw new Error('Please fix the highlighted fields.');
        }
        throw new Error((j && (j.detail || j.error)) || res.statusText);
      }
      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      nav(next && next.startsWith('/') ? next : '/app');
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally { setBusy(false); }
  }
  return (
    <main className="container mx-auto max-w-md p-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Enter your email and password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {expired && <div className="text-amber-700 bg-amber-100 border border-amber-200 rounded-xl p-2 text-sm mb-3">Your session expired. Please re-authenticate to continue.</div>}
          {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
          <form className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-1">
              <span>Email</span>
              <input className="border rounded-xl p-2" type="email" value={email} onChange={e=>{ setEmail(e.target.value); setEmailErr(""); }} required />
              {emailErr && <span className="text-red-600 text-sm">{emailErr}</span>}
            </label>
            <label className="grid gap-1">
              <span>Password</span>
              <input className="border rounded-xl p-2" type="password" value={pw} onChange={e=>{ setPw(e.target.value); setPwErr(""); }} required />
              {pwErr && <span className="text-red-600 text-sm">{pwErr}</span>}
            </label>
            <div className="flex gap-3">
              <Button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</Button>
              <Button type="button" variant="secondary" onClick={()=>nav('/signup')}>Register</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
