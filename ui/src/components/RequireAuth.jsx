import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function RequireAuth({ children }){
  const [ok, setOk] = useState(null); // null=loading, true=authed, false=not
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (!alive) return;
        if (res.ok) { setOk(true); }
        else {
          setOk(false);
          const next = `${loc.pathname}${loc.search || ''}`;
          nav(`/login?next=${encodeURIComponent(next)}`);
        }
      } catch {
        if (!alive) return;
        setOk(false);
        const next = `${loc.pathname}${loc.search || ''}`;
        nav(`/login?next=${encodeURIComponent(next)}`);
      }
    })();
    return () => { alive = false; };
  }, [loc.pathname]);

  if (ok === null) return <div className="p-6">Checking session…</div>;
  if (ok === false) return null;
  return children;
}
