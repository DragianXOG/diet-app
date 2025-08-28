import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiBase, jsonFetch, saveAuth } from "./_base";

export default function Login() {
  const base = useApiBase();
  const nav = useNavigate();
  const [email, setEmail] = useState(localStorage.getItem("diet.app.email") || "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(e){ e.preventDefault(); setErr(""); setLoading(true);
    try {
      const r = await jsonFetch(`${base}/api/v1/auth/login`, { method:"POST", body: JSON.stringify({ email, password: pw }) });
      const token = r.access_token || r.token;
      if (!token) throw new Error("No token returned");
      const me = await jsonFetch(`${base}/api/v1/auth/me`, { headers:{ Authorization:`Bearer ${token}` }});
      saveAuth({ token, userId: me.id, email });
      localStorage.setItem("diet.app.session","v2");
      nav("/app", { replace:true });
    } catch (ex) {
      const j = ex.json || {};
      const det = j.detail || j.error || ex.message;
      setErr(det || "Login failed");
    }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center bg-white">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border p-6 shadow-soft bg-white">
        <h2 className="text-3xl font-semibold text-center mb-6" style={{fontFamily:'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif'}}>Sign in</h2>
        <label className="text-sm font-medium">Email</label>
        <input className="border rounded-xl px-3 py-2 w-full mb-3" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
        <label className="text-sm font-medium">Password</label>
        <input className="border rounded-xl px-3 py-2 w-full mb-3" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" />
        {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
        <div className="flex justify-between items-center">
          <button type="button" className="px-4 py-2 rounded-xl border" onClick={()=>nav("/")}>Back</button>
          <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl border bg-[#4B0082] text-white">{loading? "Signing in..." : "Sign in"}</button>
        </div>
      </form>
    </div>
  );
}
