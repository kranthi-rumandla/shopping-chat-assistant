// Input/output guardrails applied around the assistant.

const INJECTION_PATTERNS = [
  /ignore (all|any|the)? ?(previous|prior|above) (instructions|rules)/i,
  /you are now/i,
  /system prompt/i,
  /act as (an? )?(admin|administrator|root)/i,
  /reveal (your|the) (instructions|prompt|secrets?)/i,
];

const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RE = /(\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?(\d{4})/g;

function inspectInput(text) {
  const flags = [];
  if (!text || !text.trim()) flags.push('empty');
  if (text.length > 1000) flags.push('too_long');
  if (INJECTION_PATTERNS.some(re => re.test(text))) flags.push('prompt_injection_suspected');
  if (CARD_RE.test(text)) flags.push('card_number_detected');
  CARD_RE.lastIndex = 0;
  return { flags, blocked: flags.includes('empty') || flags.includes('too_long') };
}

// Redact sensitive data before it is written to logs/audit or sent to an LLM.
function redact(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(CARD_RE, (m) => `[CARD ****${m.replace(/\D/g, '').slice(-4)}]`)
    .replace(EMAIL_RE, '$1***$2')
    .replace(PHONE_RE, '***-***-$2');
}

function maskEmail(e) { return e ? e.replace(EMAIL_RE, '$1***$2') : e; }
function maskPhone(p) { return p ? p.replace(/\d(?=\d{4})/g, '*') : p; }

// Simple per-user token bucket rate limiter.
const buckets = new Map();
function rateLimit(key, capacity = 30, refillPerSec = 0.5) {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: capacity, ts: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.ts) / 1000) * refillPerSec);
  b.ts = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

module.exports = { inspectInput, redact, maskEmail, maskPhone, rateLimit };
