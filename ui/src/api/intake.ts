const BASE = (import.meta.env.VITE_API_BASE as string) || "http://192.168.40.184:8010";

export async function getIntake(token: string) {
  const r = await fetch(`${BASE}/api/v1/intake`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`getIntake ${r.status}`);
  return r.json();
}

export async function upsertIntake(token: string, body: any) {
  const r = await fetch(`${BASE}/api/v1/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`upsertIntake ${r.status}`);
  return r.json();
}
