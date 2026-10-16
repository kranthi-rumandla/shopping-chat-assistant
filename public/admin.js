// Audit console controller.
const $ = (id) => document.getElementById(id);
let me = null;

async function init() {
  const users = await api.call('/api/auth/users');
  const sel = $('userSelect');
  sel.innerHTML = users.map(u => `<option value="${u.username}">${esc(u.displayName)} — ${ROLE_LABEL[u.role]}</option>`).join('');
  const saved = restoreSession();
  sel.value = saved?.user?.username || 'auditor.ria';
  await switchUser(sel.value);
  sel.addEventListener('change', () => switchUser(sel.value));
}

async function switchUser(username) {
  me = (await login(username)).user;
  $('tamper').classList.toggle('hidden', me.role !== 'admin');
  $('verifyBanner').classList.add('hidden');
  await Promise.all([load(), loadMatrix()]);
}

async function load() {
  const params = new URLSearchParams();
  ['q', 'type', 'decision'].forEach(k => $(k).value && params.set(k, $(k).value));
  try {
    const { records, stats } = await api.call(`/api/audit?${params}`);
    $('denied').classList.add('hidden');
    renderTiles(stats);
    renderRows(records);
  } catch (err) {
    $('denied').textContent = `🔒 ${err.message}. Your role (${ROLE_LABEL[me.role]}) cannot view the audit trail — and this attempt was itself audited.`;
    $('denied').classList.remove('hidden');
    $('tiles').innerHTML = ''; $('rows').innerHTML = '';
  }
}

function renderTiles(s) {
  const tile = (k, v) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const topIntent = Object.entries(s.intents).sort((a, b) => b[1] - a[1])[0];
  $('tiles').innerHTML = [
    tile('Audit events', s.total),
    tile('Chat responses', s.byType.chat_response || 0),
    tile('Access denied', `<span style="color:var(--danger)">${s.denies}</span>`),
    tile('Avg latency', `${s.avgLatency} ms`),
    tile('Feedback', `👍 ${s.feedback.up} · 👎 ${s.feedback.down}`),
    tile('Top intent', `<span style="font-size:16px">${topIntent ? esc(topIntent[0]) : '—'}</span>`),
  ].join('');
}

function summary(r) {
  const d = r.details || {};
  if (r.type === 'chat_request') return `“${esc((d.text || '').slice(0, 70))}”${d.flags?.length ? ` <span class="badge up">${d.flags.join(', ')}</span>` : ''}`;
  if (r.type === 'chat_response') return `${esc(d.intent || '')} → “${esc((d.text || '').slice(0, 60))}…”`;
  if (r.type === 'feedback') return `rated ${d.rating === 'up' ? '👍' : '👎'}`;
  return `${esc(r.action || '')}${r.resource ? ` · <span class="mono">${esc(r.resource)}</span>` : ''}${r.reason ? `<br><span class="small" style="color:var(--muted)">${esc(r.reason)}</span>` : ''}`;
}

function renderRows(records) {
  $('rows').innerHTML = records.map(r => `<tr class="clickable" data-seq="${r.seq}" data-resp="${r.responseId || ''}">
    <td>${r.seq}</td><td style="white-space:nowrap">${fmtTime(r.ts)}</td><td>${esc(r.actor)}</td><td><span class="badge role">${esc(r.role)}</span></td>
    <td>${esc(r.type)}</td><td>${summary(r)}</td>
    <td><span class="status ${r.decision === 'n/a' ? 'na' : r.decision}">${r.decision}</span></td>
    <td class="mono">${r.responseId || ''}</td><td class="mono" title="${r.hash}">${r.hash.slice(0, 10)}…</td></tr>`).join('');
  window.__records = Object.fromEntries(records.map(r => [r.seq, r]));
}

$('rows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const rec = window.__records[tr.dataset.seq];
  let html = `<h4>Record #${rec.seq}</h4><pre class="json">${esc(JSON.stringify(rec, null, 2))}</pre>`;
  if (tr.dataset.resp) {
    const { records, feedback } = await api.call(`/api/audit/response/${tr.dataset.resp}`);
    $('drawerTitle').textContent = `Response audit · ${tr.dataset.resp}`;
    html = `<p class="small">Full trace of one assistant turn: request → tool calls (with RBAC decisions) → response → user feedback.</p>
      <ul class="timeline">${records.map(r => `<li><div><b>${esc(r.type)}</b> <span class="status ${r.decision === 'n/a' ? 'na' : r.decision}">${r.decision}</span> ${esc(r.action || '')}</div>
      <div class="t">${fmtTime(r.ts)} · ${r.hash.slice(0, 12)}…</div><div class="small">${summary(r)}</div></li>`).join('')}</ul>
      <p><b>Feedback:</b> ${feedback ? (feedback.rating === 'up' ? '👍 helpful' : '👎 not helpful') : 'none yet'}</p>` + html;
  } else $('drawerTitle').textContent = 'Audit record';
  $('drawerBody').innerHTML = html;
  $('drawer').classList.remove('hidden');
});
$('drawerClose').addEventListener('click', () => $('drawer').classList.add('hidden'));

async function loadMatrix() {
  const m = await api.call('/api/rbac');
  $('matrix').innerHTML = `<thead><tr><th>Permission</th>${m.roles.map(r => `<th title="${esc(r.description)}">${ROLE_LABEL[r.role]}</th>`).join('')}</tr></thead>
    <tbody>${m.permissions.map(p => `<tr><td class="mono">${p}</td>${m.roles.map(r => m.grants[r.role].includes(p) ? '<td class="y">✓</td>' : '<td class="n">·</td>').join('')}</tr>`).join('')}</tbody>`;
}

$('verify').addEventListener('click', async () => {
  const b = $('verifyBanner');
  try {
    const v = await api.call('/api/audit/verify');
    b.className = `banner ${v.ok ? 'ok' : 'bad'}`;
    b.textContent = v.ok ? `✅ Hash chain intact — ${v.total} records verified. Head: ${v.head.slice(0, 16)}…` : `❌ Chain broken at record #${v.brokenAt}: ${v.reason}`;
  } catch (err) { b.className = 'banner bad'; b.textContent = `🔒 ${err.message}`; }
});
$('tamper').addEventListener('click', async () => {
  const r = await api.call('/api/audit/tamper-demo', { method: 'POST' });
  alert(r.tamperedSeq ? `Record #${r.tamperedSeq} was modified in memory. Click "Verify hash chain" to detect it. (Restart the server to restore.)` : 'No chat responses to tamper with yet.');
});
['refresh'].forEach(id => $(id).addEventListener('click', load));
['type', 'decision'].forEach(id => $(id).addEventListener('change', load));
$('q').addEventListener('keydown', (e) => e.key === 'Enter' && load());

init();
