import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Header() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [llmActive, setLlmActive] = useState(null);
  const loc = useLocation();
  const nav = useNavigate();

  async function refreshMe() {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (!res.ok) { setUser(null); return; }
      const j = await res.json().catch(()=>null);
      setUser(j || null);
      if (j && typeof j.remaining_seconds === 'number') setRemaining(j.remaining_seconds);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { refreshMe(); }, [loc.pathname]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/status', { credentials: 'include' });
        const j = await res.json().catch(()=>null);
        if (j) setLlmActive(!!(j.llm_enabled && j.llm_key_present));
      } catch {
        setLlmActive(null);
      }
    })();
  }, []);
  // Periodic session check; if expired, redirect to login with message
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (!res.ok) {
          // expired
          nav('/login?expired=1');
        }
      } catch {
        nav('/login?expired=1');
      }
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Countdown timer (client-side)
  useEffect(() => {
    if (remaining == null) return;
    const id = setInterval(() => {
      setRemaining((s) => (typeof s === 'number' ? Math.max(0, s - 1) : s));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  function fmtTime(s){
    if (typeof s !== 'number') return '';
    const m = Math.floor(s/60), sec = s%60;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  async function extendSession(){
    try {
      const res = await fetch('/api/v1/auth/extend', { method:'POST', credentials:'include' });
      const j = await res.json().catch(()=>null);
      if (res.ok && j && typeof j.remaining_seconds === 'number') setRemaining(j.remaining_seconds);
      else await refreshMe();
    } catch { await refreshMe(); }
  }

  async function logout() {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    nav("/");
  }

  return (
    <header className="w-full border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link to="/" className="font-semibold truncate">Life — Health</Link>
        <div className="flex items-center gap-2 flex-wrap">
          {llmActive != null && (
            <Badge variant={llmActive ? 'secondary' : 'outline'}>
              {llmActive ? 'LLM Active' : 'LLM Off'}
            </Badge>
          )}
          {user && (
            <>
              <span className="text-sm text-gray-600 hidden sm:inline">Signed in as {user.email}</span>
              {typeof remaining === 'number' && (
                <span className="text-xs text-gray-500">Session ends in {fmtTime(remaining)}</span>
              )}
              <Button variant="secondary" onClick={extendSession} disabled={loading}>Extend Session</Button>
              <Button onClick={logout} disabled={loading}>Logout</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
