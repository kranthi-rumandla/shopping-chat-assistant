// Assistant "tools": the only way the assistant (rule engine OR LLM) touches business data.
// Every tool authorises the caller via RBAC and emits a structured result:
//   { ok, text, card?, entities? }  — text is a short natural-language summary, card drives UI rendering.
const { db, product, customer, order, searchProducts } = require('./store');
const { authorize, limitFor, canSeePII, AccessDeniedError } = require('../security/rbac');
const { maskEmail, maskPhone } = require('../security/guardrails');

const money = (n) => `$${n.toFixed(2)}`;
const DAY = 86400000;

function guard(principal, resource, action, owner) {
  const d = authorize(principal, resource, action, owner);
  if (!d.allowed) throw new AccessDeniedError(d.reason);
  return d;
}

// Resolve which customer a request is about. Customers are always pinned to themselves.
function resolveCustomer(principal, customerId) {
  if (principal.role === 'customer') {
    if (customerId && customerId.toUpperCase() !== principal.customerId) {
      throw new AccessDeniedError(`customer ${principal.customerId} may not access data of ${customerId.toUpperCase()}`);
    }
    return principal.customerId;
  }
  return customerId || null;
}

function orderSummary(o) {
  return { id: o.id, placedAt: o.placedAt, status: o.status, total: o.total, items: o.items, carrier: o.shipment?.carrier, eta: o.shipment?.eta, customerId: o.customerId };
}

function priceStats(id) {
  const pts = db.priceHistory[id];
  if (!pts) return null;
  const prices = pts.map(p => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const current = prices[prices.length - 1];
  const d30 = prices[prices.length - 31];
  return {
    min, max, avg: +avg.toFixed(2), current,
    minDate: pts[prices.indexOf(min)].date, maxDate: pts[prices.indexOf(max)].date,
    change30dPct: +(((current - d30) / d30) * 100).toFixed(1),
    vsAvgPct: +(((current - avg) / avg) * 100).toFixed(1),
  };
}

function priceVerdict(s) {
  if (s.current <= s.min * 1.01) return 'Lowest price in 90 days — great time to buy.';
  if (s.vsAvgPct <= -5) return `Currently ${Math.abs(s.vsAvgPct)}% below its 90‑day average — good deal.`;
  if (s.vsAvgPct >= 5) return `Currently ${s.vsAvgPct}% above its 90‑day average — consider a price alert.`;
  return 'Price is close to its 90‑day average.';
}

const tools = {
  search_products: {
    description: 'Search the product catalog by keywords, optional category (Household | Grocery | Kids Playsets) and max price.',
    schema: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string', enum: ['Household', 'Grocery', 'Kids Playsets'] }, maxPrice: { type: 'number' } }, required: ['query'], additionalProperties: false },
    run(principal, { query, category, maxPrice }) {
      guard(principal, 'catalog', 'read');
      const results = searchProducts(query, { category, maxPrice });
      if (!results.length) return { ok: true, text: `I couldn't find products matching “${query}”. Try a broader term like "cleaning" or "building set".` };
      return {
        ok: true,
        text: `I found ${results.length} product${results.length > 1 ? 's' : ''} for “${query}”${maxPrice ? ` under ${money(maxPrice)}` : ''}.`,
        card: { type: 'products', title: 'Search results', data: results.map(p => ({ ...p, priceStats: priceStats(p.id) })) },
        entities: { productId: results[0].id },
      };
    },
  },

  get_order_history: {
    description: 'List a customer\'s orders, newest first. Optional filters: category, status, days (look-back window).',
    schema: { type: 'object', properties: { customerId: { type: 'string' }, category: { type: 'string' }, status: { type: 'string' }, days: { type: 'number' }, productQuery: { type: 'string' } }, additionalProperties: false },
    run(principal, { customerId, category, status, days, productQuery }) {
      const cid = resolveCustomer(principal, customerId);
      guard(principal, 'orders', 'read', cid || '__any__');
      if (!cid) return { ok: false, text: 'Which customer? Please give a customer ID (e.g. C1001).' };
      let list = db.orders.filter(o => o.customerId === cid);
      if (days) list = list.filter(o => Date.now() - new Date(o.placedAt) <= days * DAY);
      if (status) list = list.filter(o => o.status.toLowerCase().includes(status.toLowerCase()));
      if (category) list = list.filter(o => o.items.some(i => product(i.productId)?.category.toLowerCase() === category.toLowerCase()));
      if (productQuery) {
        const ids = new Set(searchProducts(productQuery, { limit: 20 }).map(p => p.id));
        list = list.filter(o => o.items.some(i => ids.has(i.productId)));
      }
      const c = customer(cid);
      if (!list.length) return { ok: true, text: `No orders found for ${principal.role === 'customer' ? 'you' : c.name} with those filters.` };
      const spend = list.filter(o => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);
      return {
        ok: true,
        text: `${principal.role === 'customer' ? 'You have' : `${c.name} has`} ${list.length} order${list.length > 1 ? 's' : ''}${days ? ` in the last ${days} days` : ''} — ${money(spend)} total spend.`,
        card: { type: 'orders', title: 'Order history', data: list.map(orderSummary) },
        entities: { orderId: list[0].id, customerId: cid },
      };
    },
  },

  track_order: {
    description: 'Get live shipment tracking (carrier, status, ETA, event timeline) for an order. If orderId is omitted, tracks the most recent open order.',
    schema: { type: 'object', properties: { orderId: { type: 'string' }, customerId: { type: 'string' } }, additionalProperties: false },
    run(principal, { orderId, customerId }) {
      let o = orderId ? order(orderId) : null;
      if (!orderId) {
        const cid = resolveCustomer(principal, customerId);
        guard(principal, 'orders', 'track', cid || '__any__');
        o = db.orders.find(x => x.customerId === cid && ['Processing', 'Shipped', 'Out for Delivery'].includes(x.status))
          || db.orders.find(x => x.customerId === cid);
      }
      if (!o) return { ok: false, text: orderId ? `I couldn't find order ${orderId}.` : 'Please share an order ID, e.g. ORD-50120.' };
      guard(principal, 'orders', 'track', o.customerId);
      if (!o.shipment) return { ok: true, text: `Order ${o.id} was ${o.status.toLowerCase()} so it has no shipment.`, entities: { orderId: o.id } };
      const last = o.shipment.events[o.shipment.events.length - 1];
      const eta = new Date(o.shipment.eta).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const etaText = ['Delivered', 'Returned'].includes(o.status) ? '' : ` Estimated delivery: ${eta}.`;
      return {
        ok: true,
        text: `Order ${o.id} is **${o.status}** with ${o.shipment.carrier} (${o.shipment.trackingNumber}). Latest: ${last.label}.${etaText}`,
        card: { type: 'tracking', title: `Tracking ${o.id}`, data: { ...orderSummary(o), shipment: o.shipment } },
        entities: { orderId: o.id },
      };
    },
  },

  get_order_details: {
    description: 'Get full details of one order (items, totals, payment, status).',
    schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'], additionalProperties: false },
    run(principal, { orderId }) {
      const o = order(orderId);
      if (!o) return { ok: false, text: `I couldn't find order ${orderId}.` };
      guard(principal, 'orders', 'read', o.customerId);
      return {
        ok: true,
        text: `Order ${o.id}: ${o.items.length} item(s), total ${money(o.total)}, status ${o.status}. Paid with ${o.payment.method} ending ${o.payment.last4}.`,
        card: { type: 'orders', title: `Order ${o.id}`, data: [orderSummary(o)] },
        entities: { orderId: o.id },
      };
    },
  },

  cancel_order: {
    description: 'Cancel an order. Only orders still in Processing can be cancelled.',
    schema: { type: 'object', properties: { orderId: { type: 'string' }, reason: { type: 'string' } }, required: ['orderId'], additionalProperties: false },
    mutating: true,
    run(principal, { orderId, reason }) {
      const o = order(orderId);
      if (!o) return { ok: false, text: `I couldn't find order ${orderId}.` };
      guard(principal, 'orders', 'cancel', o.customerId);
      if (o.status !== 'Processing') return { ok: false, text: `Order ${o.id} is already ${o.status.toLowerCase()} and can't be cancelled. You can start a return once it's delivered.`, entities: { orderId: o.id } };
      o.status = 'Cancelled';
      o.shipment = null;
      o.cancellation = { by: principal.username, reason: reason || 'Customer request', at: new Date().toISOString() };
      return { ok: true, text: `Done — order ${o.id} is cancelled. A refund of ${money(o.total)} will reach ${principal.role === 'customer' ? 'your' : 'the customer\'s'} ${o.payment.method} in 3–5 business days.`, card: { type: 'orders', title: 'Cancelled order', data: [orderSummary(o)] }, entities: { orderId: o.id } };
    },
  },

  create_return: {
    description: 'Start a return / refund for a delivered order (within 30 days).',
    schema: { type: 'object', properties: { orderId: { type: 'string' }, reason: { type: 'string' } }, required: ['orderId'], additionalProperties: false },
    mutating: true,
    run(principal, { orderId, reason }) {
      const o = order(orderId);
      if (!o) return { ok: false, text: `I couldn't find order ${orderId}.` };
      guard(principal, 'returns', 'create', o.customerId);
      if (o.status !== 'Delivered') return { ok: false, text: `Order ${o.id} is ${o.status.toLowerCase()} — only delivered orders can be returned.`, entities: { orderId: o.id } };
      const age = (Date.now() - new Date(o.placedAt)) / DAY;
      if (age > 30) return { ok: false, text: `Order ${o.id} was placed ${Math.round(age)} days ago, outside the 30‑day return window. I can raise a support ticket for an exception.`, entities: { orderId: o.id } };
      const rma = { id: `RMA-${8000 + db.returns.length + 1}`, orderId: o.id, customerId: o.customerId, reason: reason || 'Not specified', status: 'Label sent', createdAt: new Date().toISOString(), createdBy: principal.username };
      db.returns.push(rma);
      o.status = 'Return Requested';
      return { ok: true, text: `Return ${rma.id} created for ${o.id}. A prepaid ${o.shipment?.carrier || 'UPS'} label has been emailed. Refund of ${money(o.total)} is issued once the item is scanned.`, card: { type: 'kv', title: 'Return created', data: rma }, entities: { orderId: o.id } };
    },
  },

  get_price_history: {
    description: 'Get the last 90 days of price history for a product with min/max/average and a buy/wait verdict.',
    schema: { type: 'object', properties: { productId: { type: 'string' }, productQuery: { type: 'string' } }, additionalProperties: false },
    run(principal, { productId, productQuery }) {
      guard(principal, 'pricehistory', 'read');
      const p = productId ? product(productId) : searchProducts(productQuery || '', { limit: 1 })[0];
      if (!p) return { ok: false, text: 'Which product? e.g. "price history of magnetic tiles".' };
      const s = priceStats(p.id);
      return {
        ok: true,
        text: `${p.name} is ${money(s.current)} today. 90‑day range: ${money(s.min)} – ${money(s.max)} (avg ${money(s.avg)}). ${priceVerdict(s)}`,
        card: { type: 'price_history', title: `90‑day price history`, data: { product: p, stats: s, verdict: priceVerdict(s), points: db.priceHistory[p.id] } },
        entities: { productId: p.id },
      };
    },
  },

  get_recommendations: {
    description: 'Personalised product recommendations based on purchase history, preferences, wishlist and frequently-bought-together signals. Optionally anchored to a product or category.',
    schema: { type: 'object', properties: { customerId: { type: 'string' }, productId: { type: 'string' }, category: { type: 'string' } }, additionalProperties: false },
    run(principal, { customerId, productId, category }) {
      guard(principal, 'recommendations', 'read');
      const cid = resolveCustomer(principal, customerId);
      const c = cid ? customer(cid) : null;
      const bought = new Map();
      db.orders.filter(o => o.customerId === cid).forEach(o => o.items.forEach(i => bought.set(i.productId, (bought.get(i.productId) || 0) + i.qty)));
      const scores = new Map();
      const bump = (id, s, why) => { if (!product(id)) return; const cur = scores.get(id) || { s: 0, why: new Set() }; cur.s += s; cur.why.add(why); scores.set(id, cur); };
      if (productId) (db.affinity[productId] || []).forEach(id => bump(id, 5, `Often bought with ${product(productId).name.split(' ').slice(0, 3).join(' ')}`));
      bought.forEach((qty, id) => (db.affinity[id] || []).forEach(a => bump(a, 2 + qty * 0.2, 'Pairs with your past purchases')));
      c?.wishlist.forEach(id => bump(id, 2, 'On your wishlist'));
      const prefCats = category ? [category] : (c?.preferences.categories || []);
      db.products.forEach(p => {
        if (prefCats.some(pc => pc.toLowerCase() === p.category.toLowerCase())) bump(p.id, 1 + p.rating / 5, `Top rated in ${p.category}`);
        const s = priceStats(p.id);
        if (s.current <= s.min * 1.01) bump(p.id, 1.5, 'At its 90‑day low price');
        if (p.age && c?.preferences.kidsAges?.some(a => { const [lo, hi] = p.age.split('-').map(Number); return a >= lo && a <= hi; })) bump(p.id, 1.5, 'Age‑appropriate for your kids');
      });
      // Replenishment: frequently bought consumables.
      bought.forEach((qty, id) => { if (qty >= 3 && product(id).category !== 'Kids Playsets') bump(id, 2, 'Time to restock?'); });
      if (productId) scores.delete(productId);
      if (category) [...scores.keys()].forEach(id => { if (product(id).category.toLowerCase() !== category.toLowerCase()) scores.delete(id); });
      const top = [...scores.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, 6)
        .map(([id, v]) => ({ ...product(id), reason: [...v.why][0], priceStats: priceStats(id) }));
      return {
        ok: true,
        text: c ? `Here are picks for ${principal.role === 'customer' ? 'you' : c.name} based on purchase history, preferences and current deals.` : 'Here are our top picks right now.',
        card: { type: 'products', title: 'Recommended for you', data: top },
        entities: { productId: top[0]?.id },
      };
    },
  },

  get_customer_profile: {
    description: 'CRM 360° view of a customer: tier, loyalty points, segments, lifetime value, open tickets, recent orders.',
    schema: { type: 'object', properties: { customerId: { type: 'string' } }, additionalProperties: false },
    run(principal, { customerId }) {
      const cid = resolveCustomer(principal, customerId);
      guard(principal, 'profile', 'read', cid || '__any__');
      if (!cid) return { ok: false, text: 'Which customer? e.g. "profile of C1002".' };
      const c = customer(cid);
      if (!c) return { ok: false, text: `No customer ${cid}.` };
      const pii = canSeePII(principal.role) || principal.customerId === cid;
      const orders = db.orders.filter(o => o.customerId === cid);
      const data = {
        ...c, email: pii ? c.email : maskEmail(c.email), phone: pii ? c.phone : maskPhone(c.phone),
        address: pii ? c.address : c.address.replace(/^[^,]+,/, '*****,'),
        piiMasked: !pii,
        orderCount: orders.length, openOrders: orders.filter(o => ['Processing', 'Shipped', 'Out for Delivery'].includes(o.status)).length,
        openTickets: db.tickets.filter(t => t.customerId === cid && t.status !== 'Resolved').length,
        wishlist: c.wishlist.map(id => product(id)?.name),
      };
      return {
        ok: true,
        text: `${c.name} — ${c.tier} member since ${c.memberSince}, ${c.loyaltyPoints.toLocaleString()} points (≈ ${money(c.loyaltyPoints / 100)} in rewards).`,
        card: { type: 'profile', title: 'Customer 360', data },
        entities: { customerId: cid },
      };
    },
  },

  search_customers: {
    description: 'Support/admin only: find customers by name, email or ID.',
    schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    run(principal, { query }) {
      guard(principal, 'customers', 'search');
      const q = query.toLowerCase();
      const hits = db.customers.filter(c => c.id.toLowerCase() === q || c.name.toLowerCase().includes(q) || c.email.includes(q));
      if (!hits.length) return { ok: true, text: `No customers match “${query}”.` };
      const pii = canSeePII(principal.role);
      return {
        ok: true,
        text: `Found ${hits.length} customer(s).`,
        card: { type: 'customers', title: 'Customers', data: hits.map(c => ({ id: c.id, name: c.name, tier: c.tier, email: pii ? c.email : maskEmail(c.email), lifetimeValue: c.lifetimeValue })) },
        entities: { customerId: hits[0].id },
      };
    },
  },

  create_support_ticket: {
    description: 'Open a support ticket / complaint for a human agent to follow up.',
    schema: { type: 'object', properties: { subject: { type: 'string' }, orderId: { type: 'string' }, customerId: { type: 'string' }, priority: { type: 'string', enum: ['Low', 'Medium', 'High'] } }, required: ['subject'], additionalProperties: false },
    mutating: true,
    run(principal, { subject, orderId, customerId, priority }) {
      const o = orderId ? order(orderId) : null;
      const cid = resolveCustomer(principal, customerId || o?.customerId);
      if (!cid) return { ok: false, text: 'Which customer is this ticket for?' };
      guard(principal, 'tickets', 'create', cid);
      const t = { id: `TCK-${7000 + db.tickets.length + 1}`, customerId: cid, orderId: o?.id || null, subject, status: 'Open', priority: priority || 'Medium', createdAt: new Date().toISOString(), assignee: 'unassigned', notes: [`Created via chat by ${principal.username}`] };
      db.tickets.push(t);
      return { ok: true, text: `Ticket ${t.id} opened (${t.priority} priority). A support specialist will reply within 24 hours.`, card: { type: 'kv', title: 'Support ticket', data: t } };
    },
  },

  list_support_tickets: {
    description: 'List support tickets for a customer (support/admin may omit customerId to list all open tickets).',
    schema: { type: 'object', properties: { customerId: { type: 'string' } }, additionalProperties: false },
    run(principal, { customerId }) {
      const cid = resolveCustomer(principal, customerId);
      if (cid) guard(principal, 'tickets', 'read', cid); else guard(principal, 'tickets', 'read', '__any__');
      const list = db.tickets.filter(t => (cid ? t.customerId === cid : t.status !== 'Resolved'));
      if (!list.length) return { ok: true, text: 'No support tickets found.' };
      return { ok: true, text: `${list.length} ticket(s) found.`, card: { type: 'tickets', title: 'Support tickets', data: list } };
    },
  },

  adjust_loyalty_points: {
    description: 'Support/admin only: add goodwill loyalty points to a customer account (capped per role).',
    schema: { type: 'object', properties: { customerId: { type: 'string' }, points: { type: 'number' }, reason: { type: 'string' } }, required: ['customerId', 'points'], additionalProperties: false },
    mutating: true,
    run(principal, { customerId, points, reason }) {
      guard(principal, 'loyalty', 'adjust');
      const c = customer(customerId);
      if (!c) return { ok: false, text: `No customer ${customerId}.` };
      const cap = limitFor(principal.role, 'loyalty:adjust');
      if (Math.abs(points) > cap) throw new AccessDeniedError(`Adjustment of ${points} exceeds ${principal.role} limit of ${cap} points`);
      c.loyaltyPoints += points;
      return { ok: true, text: `Added ${points} points to ${c.name} (${reason || 'goodwill'}). New balance: ${c.loyaltyPoints.toLocaleString()}.`, entities: { customerId: c.id } };
    },
  },

  manage_wishlist: {
    description: 'Show the wishlist, or add a product to it.',
    schema: { type: 'object', properties: { action: { type: 'string', enum: ['show', 'add'] }, productId: { type: 'string' }, productQuery: { type: 'string' } }, required: ['action'], additionalProperties: false },
    run(principal, { action, productId, productQuery }) {
      const cid = resolveCustomer(principal);
      if (!cid) return { ok: false, text: 'Wishlists are available to signed-in customers.' };
      const c = customer(cid);
      if (action === 'add') {
        guard(principal, 'wishlist', 'write', cid);
        const p = productId ? product(productId) : searchProducts(productQuery || '', { limit: 1 })[0];
        if (!p) return { ok: false, text: 'Which product should I add?' };
        if (!c.wishlist.includes(p.id)) c.wishlist.push(p.id);
        return { ok: true, text: `Added ${p.name} to your wishlist. I'll let you know if the price drops.`, entities: { productId: p.id } };
      }
      guard(principal, 'profile', 'read', cid);
      const items = c.wishlist.map(id => ({ ...product(id), priceStats: priceStats(id) }));
      return { ok: true, text: items.length ? `You have ${items.length} item(s) on your wishlist.` : 'Your wishlist is empty.', card: items.length ? { type: 'products', title: 'Your wishlist', data: items } : undefined };
    },
  },

  create_price_alert: {
    description: 'Notify the customer when a product drops below a target price.',
    schema: { type: 'object', properties: { productId: { type: 'string' }, productQuery: { type: 'string' }, targetPrice: { type: 'number' } }, additionalProperties: false },
    mutating: true,
    run(principal, { productId, productQuery, targetPrice }) {
      const cid = resolveCustomer(principal);
      guard(principal, 'alerts', 'write', cid);
      const p = productId ? product(productId) : searchProducts(productQuery || '', { limit: 1 })[0];
      if (!p) return { ok: false, text: 'Which product should I watch?' };
      const s = priceStats(p.id);
      const target = targetPrice || +(s.min).toFixed(2);
      db.priceAlerts.push({ customerId: cid, productId: p.id, targetPrice: target, createdAt: new Date().toISOString() });
      return { ok: true, text: `Price alert set: I'll notify you when ${p.name} drops to ${money(target)} or less (today ${money(s.current)}).`, entities: { productId: p.id } };
    },
  },
};

module.exports = { tools, priceStats };
