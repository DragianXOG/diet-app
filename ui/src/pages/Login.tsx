import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch("http://192.168.40.184:8010/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error("login " + r.status);
      const data = await r.json();
      localStorage.setItem("diet.token", data.access_token);
      window.location.assign("/intake");
    } catch (e: any) {
      setErr(String(e));
    }
  }

  return (
    <div className="p-4 text-slate-100">
      <h1 className="text-xl mb-2">Login</h1>
      <form onSubmit={onLogin} className="space-y-2">
        <input className="p-2 text-black w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input className="p-2 text-black w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
        <button className="px-4 py-2 bg-blue-600 rounded" type="submit">Login</button>
      </form>
      {err && <div className="text-red-300 mt-2">{err}</div>}
    </div>
  );
}
