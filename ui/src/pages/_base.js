export function useApiBase() {
  const qs = new URLSearchParams(location.search);
  return qs.get("api") || localStorage.getItem("diet.app.base") || `${location.protocol}//${location.hostname}:8010`;
}
export async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type":"application/json", ...(opts.headers||{}) }});
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw:t }; }
  if (!res.ok) throw Object.assign(new Error(j.detail || j.error || res.statusText), {status:res.status, json:j});
  return j;
}
export function saveAuth({ token, userId, email }) {
  if (token) { localStorage.setItem("diet.app.token", token); localStorage.setItem("diet.token", token); }
  if (userId != null) localStorage.setItem("diet.app.userId", String(userId));
  if (email) localStorage.setItem("diet.app.email", email);
}
export function hasToken() {
  return !!(localStorage.getItem("diet.app.token") || localStorage.getItem("diet.token"));
}
