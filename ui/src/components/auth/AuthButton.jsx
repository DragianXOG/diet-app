import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { User, LogIn, LogOut, X } from "lucide-react";
import Button from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function useBaseUrl() {
  const qs = new URLSearchParams(location.search);
  return (
    qs.get("api") ||
    localStorage.getItem("diet.app.base") ||
    `${location.protocol}//${location.hostname}:8010`
  );
}
function saveAuth({ token, userId, email }) {
  // save broadly so legacy code can pick it up
  localStorage.setItem("diet.app.token", token);
  localStorage.setItem("diet.token", token);
  if (userId) localStorage.setItem("diet.app.userId", String(userId));
  if (email) localStorage.setItem("diet.app.email", email);
  // small event so app can react if listening
  window.dispatchEvent(new StorageEvent("storage", { key: "diet.app.token", newValue: token }));
}
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(json.detail || json.error || res.statusText), {status:res.status, json});
  return json;
}

function AuthModal({ open, onClose }) {
  const base = useBaseUrl();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [email, setEmail] = useState(localStorage.getItem("diet.app.email") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (!open) { setPassword(""); setConfirm(""); setErr(""); } }, [open]);

  async function handleLogin() {
    setErr(""); setLoading(true);
    try {
      const data = await fetchJson(`${base}/api/v1/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const token = data.access_token || data.token || data.accessToken;
      if (!token) throw new Error("No token returned");
      // get user id
      const me = await fetchJson(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      saveAuth({ token, userId: me.id, email });
      onClose?.();
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally { setLoading(false); }
  }

  async function handleRegister() {
    setErr("");
    if (!email || !password || !confirm) { setErr("Please fill every field."); return; }
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    setLoading(true);
    try {
      const r = await fetchJson(`${base}/api/v1/auth/signup`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const token = r.access_token || r.token || r.accessToken;
      const uid = r.id;
      if (token) {
        saveAuth({ token, userId: uid, email });
        onClose?.();
      } else {
        // fallback: log in
        await handleLogin();
      }
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally { setLoading(false); }
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h2>
          <button onClick={onClose} className="p-2" aria-label="Close"><X className="w-5 h-5"/></button>
        </div>

        <div className="grid gap-3">
          <div className="flex gap-2">
            <button className={`px-3 py-1.5 rounded-xl border ${mode==='login'?'bg-[#4B0082] text-white border-[#4B0082]':'hover:bg-[#4B0082]/10'}`} onClick={()=>setMode('login')}>Login</button>
            <button className={`px-3 py-1.5 rounded-xl border ${mode==='register'?'bg-[#4B0082] text-white border-[#4B0082]':'hover:bg-[#4B0082]/10'}`} onClick={()=>setMode('register')}>Register</button>
          </div>

          <label className="text-sm font-medium">Email</label>
          <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>

          <label className="text-sm font-medium">Password</label>
          <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>

          {mode === "register" && (
            <>
              <label className="text-sm font-medium">Confirm password</label>
              <Input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••"/>
            </>
          )}

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {mode === "login" ? (
              <Button onClick={handleLogin} disabled={loading} className="min-w-24 flex items-center gap-2">
                <LogIn className="w-4 h-4"/>{loading ? "Signing in..." : "Sign in"}
              </Button>
            ) : (
              <Button onClick={handleRegister} disabled={loading} className="min-w-24 flex items-center gap-2">
                <User className="w-4 h-4"/>{loading ? "Creating..." : "Create"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AuthButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(localStorage.getItem("diet.app.email") || "");
  const [hasToken, setHasToken] = useState(!!(localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token")));

  useEffect(() => {
    const onStorage = () => {
      setHasToken(!!(localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token")));
      setEmail(localStorage.getItem("diet.app.email") || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function signOut() {
    localStorage.removeItem("diet.app.token");
    localStorage.removeItem("diet.token");
    localStorage.removeItem("diet.app.userId");
    // broadcast and refresh UI
    window.dispatchEvent(new StorageEvent("storage", { key: "diet.app.token" }));
  }

  // Floating button in top-right
  return createPortal(
    <>
      <div className="fixed top-3 right-4 z-[90]">
        {!hasToken ? (
          <Button onClick={()=>setOpen(true)} className="shadow-soft">Sign in</Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Signed in{email ? `: ${email}` : ""}</span>
            <Button variant="outline" onClick={signOut} className="shadow-soft flex items-center gap-2"><LogOut className="w-4 h-4"/>Sign out</Button>
          </div>
        )}
      </div>
      <AuthModal open={open} onClose={()=>setOpen(false)}/>
    </>,
    document.body
  );
}
