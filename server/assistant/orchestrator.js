// Conversation orchestrator.
//   1. Guardrails (input inspection, rate limit, redaction)
//   2. Engine selection: Claude (tool use) when configured, else deterministic rule engine
//   3. Tool execution through the RBAC-enforcing tool layer
//   4. Audit of request, every tool call (allow/deny) and the final response
const crypto = require('crypto');
const { classify, extractEntities, productQuery } = require('./nlu');
const { tools } = require('../services/tools');
const { AccessDeniedError, hasPermission } = require('../security/rbac');
const { inspectInput, rateLimit, redact } = require('../security/guardrails');
const audit = require('../audit/auditLog');
const llm = require('./llm');

const sessions = new Map(); // sessionId -> { context: {orderId, productId, customerId}, history: [] }

function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, { context: {}, history: [] });
  return sessions.get(id);
}

function suggestionsFor(role, intent) {
  if (role === 'auditor') return ['Show access denied events', 'Verify audit chain', 'Audit summary'];
  if (role === 'support_agent') return ['Find customer James', 'Orders for C1002', 'Profile of C1002', 'Open tickets', 'Add 200 points to C1002'];
  if (role === 'admin') return ['Audit summary', 'Find customer Priya', 'Open tickets', 'Recommend kids playsets'];
  const map = {
    order_history: ['Track my latest order', 'Return an order', 'Buy again ideas'],
    track_order: ['Show my orders', 'Talk to an agent'],
    price_history: ['Alert me when it drops', 'Add it to my wishlist', 'Similar products'],
    recommendations: ['Price history of magnetic tiles', 'Show my wishlist'],
    product_search: ['Price history of it', 'Recommend similar'],
  };
  return map[intent] || ['Show my orders', 'Track my order', 'Recommend something', 'Price history of coffee', 'My loyalty points'];
}

const HELP = {
  customer: "Hi! I'm Ema, your ShopEase assistant. I can **search products**, show your **order history**, **track** deliveries, start **returns/cancellations**, show **90‑day price history**, give **recommendations**, manage your **wishlist & price alerts**, and open **support tickets**.",
  support_agent: "Agent console mode. I can **look up customers**, view any customer's **orders, tracking and 360° profile** (PII masked), open/list **tickets**, process **returns/cancellations** and grant **goodwill points** (≤500).",
  auditor: "Compliance mode. I can show **audit events**, **access‑denied attempts**, conversation **response audits** and **verify the tamper‑evident hash chain**. Business data actions are not permitted for this role.",
  admin: 'Admin mode — full access, including unmasked PII, audit log and higher loyalty limits.',
};

// Map an NLU result into a tool call (rule engine).
function planFromRules(text, principal, ctx) {
  const { intent, confidence } = classify(text);
  const e = extractEntities(text);
  const orderId = e.orderId || (e.refersToPrevious ? ctx.orderId : undefined);
  const productId = e.productId || (e.refersToPrevious ? ctx.productId : undefined);
  const pq = productQuery(text);
  const customerId = e.customerId || (principal.role !== 'customer' && !e.customerName ? ctx.customerId : undefined);
  const plan = { intent, confidence, entities: e, calls: [] };
  const call = (name, input) => plan.calls.push({ name, input: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')) });

  switch (intent) {
    case 'help': break;
    case 'order_history':
      call('get_order_history', { customerId, category: e.category, status: e.status, days: e.days, productQuery: e.category ? undefined : (pq.split(' ').length <= 3 && !/order|purchase|bought|history/i.test(pq) ? pq : undefined) });
      if (/buy again|reorder/i.test(text)) { plan.calls = []; call('get_recommendations', { customerId }); }
      break;
    case 'order_details': call('get_order_details', { orderId }); break;
    case 'track_order': call('track_order', { orderId, customerId }); break;
    case 'cancel_order': orderId ? call('cancel_order', { orderId, reason: 'Requested via chat' }) : (plan.ask = 'Which order should I cancel? Please share the order ID (e.g. ORD-50121).'); break;
    case 'create_return': orderId ? call('create_return', { orderId, reason: 'Requested via chat' }) : (plan.ask = 'Which order would you like to return? Share the order ID — you can find it in "Show my orders".'); break;
    case 'price_history':
      if (productId || pq) call('get_price_history', { productId, productQuery: productId ? undefined : pq });
      else if (ctx.productId) call('get_price_history', { productId: ctx.productId });
      else plan.ask = 'Which product? Try "price history of coffee" or a SKU like KP-3008.';
      break;
    case 'price_alert': call('create_price_alert', { productId: productId || (!pq ? ctx.productId : undefined), productQuery: pq || undefined, targetPrice: e.price }); break;
    case 'recommendations': call('get_recommendations', { customerId, productId: productId || (/similar|goes well|together/i.test(text) ? ctx.productId : undefined), category: e.category }); break;
    case 'product_search': call('search_products', { query: pq || text, category: e.category, maxPrice: e.price }); break;
    case 'profile': call('get_customer_profile', { customerId }); break;
    case 'wishlist': call('manage_wishlist', { action: /\badd|save\b/i.test(text) ? 'add' : 'show', productId: productId || (e.refersToPrevious ? ctx.productId : undefined), productQuery: pq || undefined }); break;
    case 'create_ticket': call('create_support_ticket', { subject: text.slice(0, 120), orderId: orderId || ctx.orderId, customerId, priority: /damaged|broken|missing|refund/i.test(text) ? 'High' : 'Medium' }); break;
    case 'tickets': call('list_support_tickets', { customerId: e.customerId }); break;
    case 'customer_search': call('search_customers', { query: e.customerId || e.customerName || pq || text }); break;
    case 'loyalty_adjust': call('adjust_loyalty_points', { customerId: e.customerId || ctx.customerId, points: e.points || 100, reason: 'Goodwill via chat' }); break;
    case 'audit_query': plan.audit = /verify|chain|tamper|integrity/i.test(text) ? 'verify' : /denied|deny|blocked/i.test(text) ? 'denied' : 'summary'; break;
    default: call('search_products', { query: text });
  }
  // Support agents asking "orders for C1002" style.
  if (principal.role !== 'customer' && intent === 'product_search' && e.customerId) { plan.intent = 'profile'; plan.calls = []; call('get_customer_profile', { customerId: e.customerId }); }
  return plan;
}

function runTool(name, input, principal, meta) {
  const t = tools[name];
  const started = Date.now();
  try {
    if (!t) throw new Error(`Unknown tool ${name}`);
    const result = t.run(principal, input || {});
    audit.record({ type: 'tool_call', actor: principal.username, role: principal.role, sessionId: meta.sessionId, responseId: meta.responseId, action: name, resource: input?.orderId || input?.customerId || input?.productId || null, decision: 'allow', details: { input, ok: result.ok, mutating: !!t.mutating, ms: Date.now() - started } });
    return result;
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      audit.record({ type: 'access_denied', actor: principal.username, role: principal.role, sessionId: meta.sessionId, responseId: meta.responseId, action: name, resource: input?.orderId || input?.customerId || null, decision: 'deny', reason: err.message, details: { input } });
      return { ok: false, denied: true, text: `🔒 Sorry, you don't have permission to do that. (${err.message})` };
    }
    audit.record({ type: 'tool_call', actor: principal.username, role: principal.role, sessionId: meta.sessionId, responseId: meta.responseId, action: name, decision: 'allow', reason: 'error', details: { input, error: err.message } });
    return { ok: false, text: `Something went wrong while running ${name}.` };
  }
}

function auditAnswer(kind, principal, meta) {
  if (!hasPermission(principal.role, 'audit:read')) {
    audit.record({ type: 'access_denied', actor: principal.username, role: principal.role, sessionId: meta.sessionId, responseId: meta.responseId, action: 'audit_query', decision: 'deny', reason: `role ${principal.role} lacks audit:read` });
    return { text: `🔒 Audit data is restricted to auditors and admins. This attempt has been logged.` };
  }
  if (kind === 'verify') {
    const v = audit.verify();
    return { text: v.ok ? `✅ Audit chain verified: ${v.total} records, no tampering detected. Head hash ${v.head.slice(0, 12)}…` : `❌ Audit chain BROKEN at record #${v.brokenAt}: ${v.reason}.`, card: { type: 'kv', title: 'Audit chain verification', data: v } };
  }
  if (kind === 'denied') {
    const rows = audit.query({ decision: 'deny', limit: 20 });
    return { text: `${rows.length} recent access‑denied event(s).`, card: { type: 'audit', title: 'Access denied events', data: rows } };
  }
  const s = audit.stats();
  return { text: `Audit summary: ${s.total} events, ${s.denies} denied, avg response ${s.avgLatency} ms, feedback 👍 ${s.feedback.up} / 👎 ${s.feedback.down}.`, card: { type: 'audit', title: 'Latest audit events', data: audit.query({ limit: 15 }) } };
}

async function handleMessage({ principal, sessionId, text }) {
  const responseId = `RSP-${crypto.randomUUID().slice(0, 8)}`;
  const meta = { sessionId, responseId };
  const started = Date.now();
  const session = getSession(sessionId);
  const check = inspectInput(text || '');

  audit.record({ type: 'chat_request', actor: principal.username, role: principal.role, sessionId, responseId, action: 'message', details: { text, flags: check.flags } });

  const finish = (resp) => {
    const out = { responseId, suggestions: suggestionsFor(principal.role, resp.intent), ...resp };
    out.meta = { ...(resp.meta || {}), latencyMs: Date.now() - started, auditId: responseId, flags: check.flags };
    audit.record({ type: 'chat_response', actor: principal.username, role: principal.role, sessionId, responseId, action: out.intent || 'reply', details: { intent: out.intent, engine: out.meta.engine, text: out.text, cards: (out.cards || []).map(c => c.type), toolCalls: out.meta.toolCalls, latencyMs: out.meta.latencyMs } });
    session.history.push({ role: 'user', text: redact(text) }, { role: 'assistant', text: out.text });
    session.history = session.history.slice(-20);
    return out;
  };

  if (!rateLimit(principal.username)) return finish({ text: 'You are sending messages too quickly. Please wait a moment.', intent: 'rate_limited', meta: { engine: 'guardrail' } });
  if (check.blocked) return finish({ text: 'Please enter a shorter message (max 1000 characters).', intent: 'blocked', meta: { engine: 'guardrail' } });
  if (check.flags.includes('prompt_injection_suspected')) {
    audit.record({ type: 'guardrail', actor: principal.username, role: principal.role, sessionId, responseId, action: 'prompt_injection_suspected', decision: 'deny', details: { text } });
  }
  if (check.flags.includes('prompt_injection_suspected')) {
    return finish({ text: "I can only help with shopping tasks for your account, and I can't change my rules or your permissions. This request has been logged. Is there something I can help you find or track?", intent: 'guardrail_blocked', meta: { engine: 'guardrail' } });
  }
  const preface = check.flags.includes('card_number_detected') ? '⚠️ For your security, never share full card numbers in chat — I have redacted it. ' : '';

  // --- LLM path ---
  if (llm.enabled()) {
    try {
      const r = await llm.respond({ principal, text: redact(text), history: session.history, context: session.context, runTool: (n, i) => runTool(n, i, principal, meta) });
      Object.assign(session.context, r.entities);
      return finish({ text: preface + r.text, cards: r.cards, intent: r.intent, meta: { engine: `claude:${llm.MODEL}`, toolCalls: r.toolCalls } });
    } catch (err) {
      console.warn('[llm] falling back to rule engine:', err.message);
    }
  }

  // --- Rule engine path ---
  const plan = planFromRules(text, principal, session.context);
  if (plan.intent === 'help') return finish({ text: HELP[principal.role] || HELP.customer, intent: 'help', meta: { engine: 'rules', confidence: plan.confidence } });
  if (plan.audit) { const a = auditAnswer(plan.audit, principal, meta); return finish({ text: a.text, cards: a.card ? [a.card] : [], intent: 'audit_query', meta: { engine: 'rules' } }); }
  if (plan.ask) return finish({ text: plan.ask, intent: plan.intent, meta: { engine: 'rules', confidence: plan.confidence } });

  const texts = []; const cards = []; const toolCalls = [];
  for (const c of plan.calls) {
    const r = runTool(c.name, c.input, principal, meta);
    toolCalls.push({ name: c.name, input: c.input, ok: r.ok, denied: !!r.denied });
    texts.push(r.text);
    if (r.card) cards.push(r.card);
    if (r.entities) Object.assign(session.context, r.entities);
  }
  return finish({ text: preface + texts.join('\n\n'), cards, intent: plan.intent, meta: { engine: 'rules', confidence: plan.confidence, entities: plan.entities, toolCalls } });
}

function recordFeedback({ principal, responseId, rating, comment }) {
  return audit.record({ type: 'feedback', actor: principal.username, role: principal.role, responseId, action: 'rate_response', details: { rating, comment: comment || null } });
}

module.exports = { handleMessage, recordFeedback, planFromRules, sessions, HELP };
