#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Ensure folder exists
mkdir -p ui/public

# Helpful default API base for local dev
if [[ ! -f ui/.env.local ]]; then
  printf "VITE_API_BASE=http://127.0.0.1:8010/api/v1\n" > ui/.env.local
  echo "📝 Wrote ui/.env.local with VITE_API_BASE=http://127.0.0.1:8010/api/v1"
fi

# Write pricing console
cat > ui/public/pricing.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Diet App • Pricing Console</title>
  <style>
    :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", sans-serif; }
    body { margin: 24px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    input[type="text"] { width: 520px; padding: 8px; }
    input.token { width: 680px; }
    button { padding: 8px 12px; cursor: pointer; }
    .card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; margin: 16px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    tfoot td { font-weight: 600; }
    .muted { color: #6b7280; }
    .ok { color: #16a34a; }
    .warn { color: #b45309; }
    .err { color: #dc2626; font-weight: 600; }
    code { background: #f6f8fa; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Diet App • Pricing Console</h1>

  <div class="card">
    <div class="row">
      <label>API Base</label>
      <input id="base" type="text" value="" />
      <small class="muted">Default comes from <code>VITE_API_BASE</code> or http://127.0.0.1:8010/api/v1</small>
    </div>
    <div class="row">
      <label>Bearer Token</label>
      <input id="tok" class="token" type="text" placeholder="Paste your JWT access_token here"/>
    </div>
    <div class="row">
      <button id="btn-rationalize">Rationalize intake</button>
      <button id="btn-plan">Generate plan (7d, persist)</button>
      <button id="btn-sync">Sync groceries (current UTC week)</button>
      <button id="btn-preview">Preview prices</button>
      <button id="btn-assign">Assign & persist prices</button>
    </div>
    <div id="status" class="muted"></div>
  </div>

  <div id="preview-card" class="card" style="display:none">
    <h3>Price Preview</h3>
    <table>
      <thead>
        <tr><th>Item</th><th>Store</th><th>Unit Price</th><th>Qty</th><th>Line Total</th></tr>
      </thead>
      <tbody id="tbody"></tbody>
      <tfoot>
        <tr><td colspan="5" id="totals"></td></tr>
      </tfoot>
    </table>
    <div id="persist-note" class="muted" style="margin-top:8px"></div>
  </div>

  <script>
    const $ = (sel) => document.querySelector(sel);
    const fmt = new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'});

    // Defaults
    const envBase = (window.VITE_API_BASE || (window.API_BASE)) || 'http://127.0.0.1:8010/api/v1';
    $('#base').value = localStorage.getItem('pricing.base') || envBase;
    const savedTok = localStorage.getItem('access_token') || localStorage.getItem('token') || '';
    $('#tok').value = savedTok;

    function setStatus(msg, cls) {
      const el = $('#status');
      el.className = cls || 'muted';
      el.textContent = msg;
    }

    function bearer() {
      const t = $('#tok').value.trim();
      localStorage.setItem('access_token', t);
      return t ? {'Authorization': 'Bearer ' + t} : {};
    }
    function base() {
      const b = $('#base').value.trim() || envBase;
      localStorage.setItem('pricing.base', b);
      return b.replace(/\/+$/,'');
    }

    async function call(path, opts={}) {
      const url = base() + path;
      const headers = Object.assign({'Content-Type':'application/json'}, bearer(), opts.headers || {});
      const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${res.statusText} :: ${txt}`);
      }
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? await res.json() : await res.text();
    }

    $('#btn-rationalize').onclick = async () => {
      try {
        setStatus('Rationalizing...', 'muted');
        const data = await call('/intake/rationalize', {method:'POST'});
        setStatus(`Diet: ${data.diet_label}; meals/day: ${data.meals_per_day}; times: ${data.times.join(', ')}`, 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
    };

    $('#btn-plan').onclick = async () => {
      try {
        setStatus('Generating 7-day plan...', 'muted');
        const data = await call('/plans/generate', {method:'POST', body:{days:7,persist:true,include_recipes:true,confirm:true}});
        setStatus(`Plan generated ${data.start} → ${data.end} (${data.days.length} days)`, 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
    };

    $('#btn-sync').onclick = async () => {
      try {
        setStatus('Syncing groceries from meals...', 'muted');
        const today = new Date();
        const y = today.getUTCFullYear();
        const m = String(today.getUTCMonth()+1).padStart(2,'0');
        const d = String(today.getUTCDate()).padStart(2,'0');
        const start = `${y}-${m}-${d}`;
        const endDate = new Date(Date.UTC(y, today.getUTCMonth(), today.getUTCDate()+6));
        const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-${String(endDate.getUTCDate()).padStart(2,'0')}`;
        const data = await call(`/groceries/sync_from_meals?start=${start}&end=${end}&persist=true`, {method:'POST'});
        setStatus(`Groceries synced: created=${data.created}, unique=${data.count}, window=${data.window.start}..${data.window.end}`, 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
    };

    $('#btn-preview').onclick = async () => {
      try {
        setStatus('Loading price preview...', 'muted');
        const data = await call('/groceries/price_preview');
        const tb = $('#tbody'); tb.innerHTML = '';
        data.items.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.name}</td>
            <td>${row.suggested_store}</td>
            <td>${fmt.format(row.unit_price)}</td>
            <td>${(row.qty || row.quantity || 1)}</td>
            <td>${fmt.format(row.total_price)}</td>
          `;
          tb.appendChild(tr);
        });
        const totalsStr = Object.entries(data.totals || {}).map(([k,v]) => `${k}: ${fmt.format(v)}`).join(' • ');
        $('#totals').textContent = `${totalsStr}  |  Grand total: ${fmt.format(data.grand_total)}`;
        $('#persist-note').textContent = '';
        $('#preview-card').style.display = '';
        setStatus('Preview ready.', 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
    };

    $('#btn-assign').onclick = async () => {
      try {
        setStatus('Assigning & persisting prices...', 'muted');
        const data = await call('/groceries/price_assign', {method:'POST'});
        const totalsStr = Object.entries(data.totals || {}).map(([k,v]) => `${k}: ${fmt.format(v)}`).join(' • ');
        $('#totals').textContent = `${totalsStr}  |  Grand total: ${fmt.format(data.grand_total)}`;
        const meta = data.persist || {};
        $('#persist-note').innerHTML = meta.backend === 'db'
          ? 'Persisted in <strong>database</strong>.'
          : `Persisted to <strong>file</strong>: <code>${meta.path || '-'}</code>`;
        $('#preview-card').style.display = '';
        setStatus(`Prices assigned. Backend=${meta.backend || '?'}, updated=${data.updated}`, 'ok');
      } catch (e) { setStatus(e.message, 'err'); }
    };
  </script>
</body>
</html>
HTML

echo "✅ Created ui/public/pricing.html"
echo "➡  Next: start Vite dev server to view it"
echo "    cd ui && npm install && npm run dev -- --host 0.0.0.0"
echo "    Then open: http://<your-server-ip>:5173/pricing.html"
