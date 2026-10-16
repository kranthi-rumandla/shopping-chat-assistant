// Rich card renderers for assistant responses. Each returns an HTMLElement.
// Buttons with data-say="..." send that text back to the assistant.

const Cards = {
  render(card) {
    const fn = Cards[card.type] || Cards.kv;
    const wrap = el(`<div class="card"><h4>${esc(card.title || '')}</h4></div>`);
    wrap.appendChild(fn(card.data));
    return wrap;
  },

  products(list) {
    const box = el('<div class="hscroll"></div>');
    list.forEach(p => {
      const s = p.priceStats;
      const badge = s && s.current <= s.min * 1.01 ? '<span class="badge low">90‑day low</span>'
        : s && s.vsAvgPct <= -5 ? `<span class="badge low">${s.vsAvgPct}% vs avg</span>` : '';
      box.appendChild(el(`<div class="mini">
        <div class="icon">${p.icon}</div>
        <div class="n">${esc(p.name)}</div>
        <div><b>${money(p.price)}</b> · ⭐ ${p.rating} ${badge}</div>
        ${p.reason ? `<div class="reason">✨ ${esc(p.reason)}</div>` : ''}
        <button class="btn ghost small" data-say="Price history of ${esc(p.id)}">📈 Price history</button>
      </div>`));
    });
    return box;
  },

  orders(list) {
    const body = el('<div class="body"></div>');
    list.forEach(o => {
      const items = o.items.map(i => `${i.icon} ${esc(i.name)} ×${i.qty}`).join('<br>');
      const actions = [];
      if (['Shipped', 'Out for Delivery', 'Processing', 'Delivered'].includes(o.status)) actions.push(`<button class="btn small ghost" data-say="Track ${o.id}">Track</button>`);
      if (o.status === 'Processing') actions.push(`<button class="btn small ghost" data-say="Cancel ${o.id}">Cancel</button>`);
      if (o.status === 'Delivered') actions.push(`<button class="btn small ghost" data-say="Return ${o.id}">Return</button>`);
      body.appendChild(el(`<div class="row">
        <div class="grow">
          <div class="title">${o.id} <span class="status ${o.status.split(' ')[0]}">${esc(o.status)}</span></div>
          <div class="small">${fmtDate(o.placedAt)} · ${money(o.total)}${o.customerId ? ` · ${o.customerId}` : ''}</div>
          <details class="small"><summary>${o.items.length} item(s)</summary>${items}</details>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">${actions.join('')}</div>
      </div>`));
    });
    return body;
  },

  tracking(o) {
    const steps = ['Order placed', 'Packed', 'In transit', 'Out for delivery', 'Delivered'];
    const level = { Processing: 1, Shipped: 3, 'Out for Delivery': 4, Delivered: 5, Returned: 5, 'Return Requested': 5 }[o.status] || 1;
    const ev = [...o.shipment.events].reverse();
    return el(`<div class="body">
      <div class="small"><b>${esc(o.shipment.carrier)}</b> · <span class="mono">${esc(o.shipment.trackingNumber)}</span></div>
      <div class="progress">${steps.map((s, i) => `<div class="${i < level ? 'done' : ''}" title="${s}"></div>`).join('')}</div>
      <ul class="timeline">${ev.map(e => `<li><div>${esc(e.label)}</div><div class="t">${fmtTime(e.ts)} · ${esc(e.location)}</div></li>`).join('')}</ul>
    </div>`);
  },

  price_history({ product, stats, verdict, points }) {
    const W = 360, H = 150, P = { l: 38, r: 8, t: 10, b: 22 };
    const prices = points.map(p => p.price);
    const lo = Math.min(...prices) * 0.97, hi = Math.max(...prices) * 1.03;
    const x = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
    const avgY = y(stats.avg);
    const minI = prices.indexOf(stats.min), maxI = prices.indexOf(stats.max);
    const ticks = [0, 30, 60, 89].map(i => `<text x="${x(i)}" y="${H - 6}" font-size="9" fill="#6b7280" text-anchor="middle">${points[i].date.slice(5)}</text>`).join('');
    const yt = [lo, (lo + hi) / 2, hi].map(v => `<text x="${P.l - 4}" y="${y(v) + 3}" font-size="9" fill="#6b7280" text-anchor="end">$${v.toFixed(0)}</text>`).join('');
    const node = el(`<div class="body chart">
      <div class="row" style="border:none;padding:0 0 6px"><span class="icon">${product.icon}</span><div class="grow"><div class="title">${esc(product.name)}</div><div class="small">${product.id} · today <b>${money(stats.current)}</b></div></div></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="90 day price chart">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14b8a6" stop-opacity=".35"/><stop offset="1" stop-color="#14b8a6" stop-opacity="0"/></linearGradient></defs>
        ${yt}${ticks}
        <line x1="${P.l}" x2="${W - P.r}" y1="${avgY}" y2="${avgY}" stroke="#9ca3af" stroke-dasharray="3 3"/>
        <text x="${W - P.r}" y="${avgY - 3}" font-size="9" fill="#6b7280" text-anchor="end">avg ${money(stats.avg)}</text>
        <path d="${area}" fill="url(#g)"/>
        <path d="${line}" fill="none" stroke="#0f766e" stroke-width="2"/>
        <circle cx="${x(minI)}" cy="${y(stats.min)}" r="4" fill="#16a34a"/>
        <circle cx="${x(maxI)}" cy="${y(stats.max)}" r="4" fill="#dc2626"/>
        <circle cx="${x(points.length - 1)}" cy="${y(stats.current)}" r="4" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>
        <line class="cursor" y1="${P.t}" y2="${H - P.b}" stroke="#0f766e" stroke-opacity=".4" visibility="hidden"/>
        <rect class="hit" x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent"/>
      </svg>
      <div class="tip">Hover the chart to see daily prices</div>
      <div class="stats">
        <div>90‑day low<b style="color:#16a34a">${money(stats.min)}</b>${stats.minDate.slice(5)}</div>
        <div>90‑day high<b style="color:#dc2626">${money(stats.max)}</b>${stats.maxDate.slice(5)}</div>
        <div>30‑day change<b>${stats.change30dPct > 0 ? '+' : ''}${stats.change30dPct}%</b>vs avg ${stats.vsAvgPct > 0 ? '+' : ''}${stats.vsAvgPct}%</div>
      </div>
      <div class="verdict">💡 ${esc(verdict)}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn small" data-say="Alert me when ${esc(product.id)} drops below $${(stats.min).toFixed(2)}">🔔 Price alert</button>
        <button class="btn small ghost" data-say="Recommend products similar to ${esc(product.id)}">Similar items</button>
      </div>
    </div>`);
    const svg = node.querySelector('svg'), tip = node.querySelector('.tip'), cur = node.querySelector('.cursor');
    node.querySelector('.hit').addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const vx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((vx - P.l) / (W - P.l - P.r)) * (points.length - 1))));
      cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i)); cur.setAttribute('visibility', 'visible');
      tip.textContent = `${fmtDate(points[i].date)}: ${money(points[i].price)}${points[i].promo ? ' (promo)' : ''}`;
    });
    return node;
  },

  profile(c) {
    return el(`<div class="body">
      <div class="row" style="border:none"><div class="avatar" style="background:var(--brand-soft)">👤</div>
        <div class="grow"><div class="title">${esc(c.name)} <span class="badge role">${esc(c.tier)}</span></div><div class="small">${esc(c.id)} · member since ${esc(c.memberSince)}</div></div></div>
      <div class="stats">
        <div>Loyalty pts<b>${c.loyaltyPoints.toLocaleString()}</b></div>
        <div>Lifetime value<b>${money(c.lifetimeValue)}</b></div>
        <div>Orders<b>${c.orderCount}</b>${c.openOrders} open</div>
      </div>
      <dl class="kv" style="margin-top:10px">
        <dt>Email</dt><dd>${esc(c.email)}</dd>
        <dt>Phone</dt><dd>${esc(c.phone)}</dd>
        <dt>Address</dt><dd>${esc(c.address)}</dd>
        <dt>Segments</dt><dd>${c.segments.map(esc).join(', ')}</dd>
        <dt>Preferences</dt><dd>${c.preferences.categories.map(esc).join(', ')} · via ${esc(c.preferences.channel)}</dd>
        <dt>Wishlist</dt><dd>${c.wishlist.map(esc).join(', ') || '—'}</dd>
        <dt>Open tickets</dt><dd>${c.openTickets}</dd>
      </dl>
      ${c.piiMasked ? '<div class="small" style="margin-top:6px">🔒 PII masked for your role</div>' : ''}
    </div>`);
  },

  customers(list) {
    const body = el('<div class="body"></div>');
    list.forEach(c => body.appendChild(el(`<div class="row"><div class="grow"><div class="title">${esc(c.name)} <span class="badge role">${esc(c.tier)}</span></div><div class="small">${c.id} · ${esc(c.email)} · LTV ${money(c.lifetimeValue)}</div></div>
      <button class="btn small ghost" data-say="Profile of ${c.id}">360°</button><button class="btn small ghost" data-say="Orders for ${c.id}">Orders</button></div>`)));
    return body;
  },

  tickets(list) {
    const body = el('<div class="body"></div>');
    list.forEach(t => body.appendChild(el(`<div class="row"><div class="grow"><div class="title">${t.id} <span class="status ${t.status === 'Open' ? 'Processing' : 'Delivered'}">${esc(t.status)}</span></div>
      <div class="small">${esc(t.subject)}</div><div class="small">${t.customerId} · ${esc(t.priority)} · ${fmtDate(t.createdAt)}</div></div></div>`)));
    return body;
  },

  audit(list) {
    const rows = list.map(r => `<tr><td>${fmtTime(r.ts)}</td><td>${esc(r.actor)}</td><td>${esc(r.type)}<br><span class="small">${esc(r.action || '')}</span></td><td><span class="status ${r.decision === 'n/a' ? 'na' : r.decision}">${r.decision}</span></td></tr>`).join('');
    return el(`<div class="body"><table class="mini-table"><tr><th>Time</th><th>Actor</th><th>Event</th><th>Decision</th></tr>${rows}</table></div>`);
  },

  kv(obj) {
    const entries = Object.entries(obj || {}).filter(([, v]) => v !== null && typeof v !== 'object');
    return el(`<div class="body"><dl class="kv">${entries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`);
  },
};
