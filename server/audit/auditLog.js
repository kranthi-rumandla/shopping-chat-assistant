// Append-only, hash-chained audit log.
// Each record stores the SHA-256 of the previous record, so any edit/deletion breaks the chain
// and is detected by verify(). Records are persisted as JSON Lines.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redact } = require('../security/guardrails');

const LOG_DIR = process.env.AUDIT_DIR || path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.jsonl');
const GENESIS = '0'.repeat(64);

const records = [];
const feedback = new Map(); // responseId -> {rating, comment, by, ts}

function hashRecord(r) {
  const { hash, ...rest } = r;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

function load() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) return;
  for (const line of fs.readFileSync(LOG_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      records.push(r);
      if (r.type === 'feedback') feedback.set(r.responseId, r.details);
    } catch { /* skip corrupt line; verify() will report the gap */ }
  }
}

/**
 * Record an audit event.
 * @param {object} e  { type, actor, role, sessionId, action, resource, decision, reason, details, responseId }
 */
function record(e) {
  const prev = records.length ? records[records.length - 1].hash : GENESIS;
  const rec = {
    seq: records.length + 1,
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    ts: new Date().toISOString(),
    type: e.type,                    // chat_request | chat_response | tool_call | access_denied | auth | feedback | guardrail | admin
    actor: e.actor || 'system',
    role: e.role || 'system',
    sessionId: e.sessionId || null,
    responseId: e.responseId || null,
    action: e.action || null,
    resource: e.resource || null,
    decision: e.decision || 'n/a',   // allow | deny | n/a
    reason: e.reason || null,
    details: sanitize(e.details),
    prevHash: prev,
  };
  rec.hash = hashRecord(rec);
  records.push(rec);
  if (rec.type === 'feedback') feedback.set(rec.responseId, rec.details);
  fs.appendFile(LOG_FILE, JSON.stringify(rec) + '\n', () => {});
  return rec;
}

function sanitize(details) {
  if (details == null) return null;
  return JSON.parse(JSON.stringify(details, (k, v) => (typeof v === 'string' ? redact(v) : v)));
}

function query({ actor, type, decision, responseId, sessionId, q, limit = 200 } = {}) {
  let out = records;
  if (actor) out = out.filter(r => r.actor === actor);
  if (type) out = out.filter(r => r.type === type);
  if (decision) out = out.filter(r => r.decision === decision);
  if (responseId) out = out.filter(r => r.responseId === responseId);
  if (sessionId) out = out.filter(r => r.sessionId === sessionId);
  if (q) { const s = q.toLowerCase(); out = out.filter(r => JSON.stringify(r).toLowerCase().includes(s)); }
  return out.slice(-limit).reverse();
}

function verify() {
  let prev = GENESIS;
  for (const r of records) {
    if (r.prevHash !== prev) return { ok: false, brokenAt: r.seq, reason: 'prevHash mismatch', total: records.length };
    if (hashRecord(r) !== r.hash) return { ok: false, brokenAt: r.seq, reason: 'record hash mismatch (tampered)', total: records.length };
    prev = r.hash;
  }
  return { ok: true, total: records.length, head: prev };
}

function stats() {
  const byType = {}; const denies = records.filter(r => r.decision === 'deny').length;
  records.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });
  const fb = [...feedback.values()];
  const responses = records.filter(r => r.type === 'chat_response');
  const avgLatency = responses.length ? Math.round(responses.reduce((s, r) => s + (r.details?.latencyMs || 0), 0) / responses.length) : 0;
  const intents = {};
  responses.forEach(r => { const i = r.details?.intent || 'unknown'; intents[i] = (intents[i] || 0) + 1; });
  return {
    total: records.length, byType, denies, avgLatency, intents,
    feedback: { up: fb.filter(f => f.rating === 'up').length, down: fb.filter(f => f.rating === 'down').length },
  };
}

// Demo helper: lets the admin console show how tampering is detected.
function tamperForDemo() {
  const victim = records.find(r => r.type === 'chat_response');
  if (!victim) return null;
  victim.details = { ...(victim.details || {}), text: '[[edited by attacker]]' };
  return victim.seq;
}

load();
module.exports = { record, query, verify, stats, tamperForDemo, feedback };
