// ui/src/lib/api.js
const API_BASE =
  import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8010/api/v1';

function authHeaders() {
  const tok = localStorage.getItem('access_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

async function handle(res) {
  if (!res.ok) {
    const txt = await res.text();
    // Try to surface FastAPI {detail: "..."} nicely
    try {
      const parsed = JSON.parse(txt);
      throw new Error(parsed?.detail || res.statusText);
    } catch {
      throw new Error(txt || res.statusText);
    }
  }
  return res.json();
}

export async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  return handle(res);
}

export async function postJSON(path, body = {}, method = 'POST') {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handle(res);
}

