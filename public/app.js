// Storefront + chat widget controller.
const $ = (id) => document.getElementById(id);
const chatState = { sessionId: null, open: false, user: null };

// ---------- Auth / user switcher ----------
async function initUsers() {
  const users = await api.call('/api/auth/users');
  const sel = $('userSelect');
  sel.innerHTML = users.map(u => `<option value="${u.username}">${esc(u.displayName)} — ${ROLE_LABEL[u.role]}</option>`).join('');
  const saved = restoreSession();
  const username = saved?.user?.username && users.some(u => u.username === saved.user.username) ? saved.user.username : 'priya';
  sel.value = username;
  await switchUser(username);
  sel.addEventListener('change', () => switchUser(sel.value));
}

async function switchUser(username) {
  const r = await login(username);
  chatState.user = r.user;
  chatState.sessionId = `${username}-${Date.now()}`;
  $('consoleLink').classList.toggle('hidden', !['admin', 'auditor'].includes(r.user.role));
  const health = await api.call('/api/health');
  $('chatSub').innerHTML = `${esc(r.user.name)} · <span class="badge role">${ROLE_LABEL[r.user.role]}</span> · ${health.engine.startsWith('claude') ? '🤖 Claude' : '⚙️ Rule engine'}`;
  $('messages').innerHTML = '';
  sendChat('hi', { silent: true });
}

// ---------- Storefront ----------
let currentCat = '';
async function loadProducts() {
  const list = await api.call(`/api/products${currentCat ? `?category=${encodeURIComponent(currentCat)}` : ''}`);
  const q = $('searchInput').value.trim().toLowerCase();
  const filtered = q ? list.filter(p => `${p.name} ${p.tags.join(' ')} ${p.category}`.toLowerCase().includes(q)) : list;
  $('productGrid').innerHTML = '';
  filtered.forEach(p => {
    const s = p.priceStats;
    const badge = s.current <= s.min * 1.01 ? '<span class="badge low">📉 90‑day low</span>'
      : s.vsAvgPct <= -5 ? `<span class="badge low">${s.vsAvgPct}% vs avg</span>`
        : s.vsAvgPct >= 5 ? `<span class="badge up">+${s.vsAvgPct}% vs avg</span>` : '';
    const card = el(`<article class="product">
      ${badge}
      <div class="icon">${p.icon}</div>
      <div class="meta">${esc(p.category)} · ${esc(p.brand)}${p.age ? ` · Ages ${p.age}` : ''}</div>
      <div class="name">${esc(p.name)}</div>
      <div><span class="price">${money(p.price)}</span> <span class="meta">⭐ ${p.rating}</span></div>
      <div class="actions">
        <button class="btn ghost small" data-say="Price history of ${p.id}">📈 Price history</button>
        <button class="btn small" data-say="Recommend products similar to ${p.id}">Ask Ema</button>
      </div>
    </article>`);
    $('productGrid').appendChild(card);
  });
  if (!filtered.length) $('productGrid').innerHTML = '<p>No products match. Try asking Ema!</p>';
}

$('categoryChips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
  currentCat = b.dataset.cat; loadProducts();
});
$('searchForm').addEventListener('submit', (e) => { e.preventDefault(); loadProducts(); });

// ---------- Chat ----------
function toggleChat(open = !chatState.open) {
  chatState.open = open;
  $('chat').classList.toggle('hidden', !open);
  $('fab').querySelector('.dot')?.remove();
  if (open) $('chatInput').focus();
}
$('fab').addEventListener('click', () => toggleChat());
$('chatClose').addEventListener('click', () => toggleChat(false));
$('heroAsk').addEventListener('click', () => toggleChat(true));

function addUserMsg(text) {
  $('messages').appendChild(el(`<div class="msg user"><div class="bubble">${esc(text)}</div></div>`));
  scrollChat();
}

function addBotMsg(r) {
  const m = el(`<div class="msg bot"><div class="bubble">${md(r.text)}</div></div>`);
  (r.cards || []).forEach(c => m.appendChild(Cards.render(c)));
  const engine = r.meta?.engine || '';
  const foot = el(`<div class="msg-foot">
    <button title="Helpful" data-rate="up">👍</button><button title="Not helpful" data-rate="down">👎</button>
    <span>Audit <code>${esc(r.responseId)}</code></span><span>· ${esc(r.intent || '')} · ${esc(engine)} · ${r.meta?.latencyMs ?? 0} ms</span>
  </div>`);
  foot.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rate]'); if (!b) return;
    foot.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('on', x === b));
    try { await api.call('/api/chat/feedback', { method: 'POST', body: { responseId: r.responseId, rating: b.dataset.rate } }); b.title = 'Thanks — feedback recorded in audit log'; } catch (err) { b.title = err.message; }
  });
  m.appendChild(foot);
  $('messages').appendChild(m);
  scrollChat();
}

function setSuggestions(list = []) {
  $('suggestions').innerHTML = list.map(s => `<button data-say="${esc(s)}">${esc(s)}</button>`).join('');
}

function scrollChat() { const box = $('messages'); box.scrollTop = box.scrollHeight; }

async function sendChat(text, { silent = false } = {}) {
  if (!text.trim()) return;
  if (!silent) { toggleChat(true); addUserMsg(text); }
  const typing = el('<div class="msg bot"><div class="bubble typing"><span></span><span></span><span></span></div></div>');
  $('messages').appendChild(typing); scrollChat();
  try {
    const r = await api.call('/api/chat', { method: 'POST', body: { message: text, sessionId: chatState.sessionId } });
    typing.remove(); addBotMsg(r); setSuggestions(r.suggestions);
  } catch (err) {
    typing.remove();
    addBotMsg({ text: `⚠️ ${err.status === 401 ? 'Session expired — please re-select your user.' : err.message}`, responseId: '—', meta: {} });
  }
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('chatInput').value; $('chatInput').value = '';
  sendChat(v);
});

// Any element with data-say sends that text to the assistant.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]'); if (!b) return;
  sendChat(b.dataset.say);
});

initUsers().then(loadProducts);
