// ShopEase API gateway + static web host.
const path = require('path');
const express = require('express');
const { issueToken, authMiddleware } = require('./security/auth');
const { hasPermission, matrix } = require('./security/rbac');
const { handleMessage, recordFeedback } = require('./assistant/orchestrator');
const audit = require('./audit/auditLog');
const llm = require('./assistant/llm');
const { db } = require('./services/store');
const { priceStats } = require('./services/tools');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

const requirePerm = (perm) => (req, res, next) => {
  if (hasPermission(req.principal.role, perm)) return next();
  audit.record({ type: 'access_denied', actor: req.principal.username, role: req.principal.role, action: `${req.method} ${req.path}`, decision: 'deny', reason: `missing ${perm}` });
  res.status(403).json({ error: `Forbidden: requires ${perm}` });
};

// ---- Auth (demo login; replace with OIDC in production) ----
app.get('/api/auth/users', (req, res) => res.json(db.users.map(u => ({ username: u.username, displayName: u.displayName, role: u.role }))));
app.post('/api/auth/login', (req, res) => {
  const user = db.users.find(u => u.username === req.body?.username);
  if (!user) return res.status(401).json({ error: 'Unknown user' });
  audit.record({ type: 'auth', actor: user.username, role: user.role, action: 'login', decision: 'allow' });
  res.json({ token: issueToken(user), user: { username: user.username, name: user.displayName, role: user.role, customerId: user.customerId || null } });
});

// ---- Public catalog for the storefront ----
app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const list = category ? db.products.filter(p => p.category === category) : db.products;
  res.json(list.map(p => ({ ...p, priceStats: priceStats(p.id) })));
});

// ---- Assistant ----
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, sessionId } = req.body || {};
  const out = await handleMessage({ principal: req.principal, sessionId: sessionId || `${req.principal.username}-default`, text: String(message || '') });
  res.json(out);
});
app.post('/api/chat/feedback', authMiddleware, requirePerm('feedback:create'), (req, res) => {
  const { responseId, rating, comment } = req.body || {};
  if (!responseId || !['up', 'down'].includes(rating)) return res.status(400).json({ error: 'responseId and rating (up|down) required' });
  res.json({ ok: true, auditId: recordFeedback({ principal: req.principal, responseId, rating, comment }).id });
});

// ---- Audit & governance ----
app.get('/api/audit', authMiddleware, requirePerm('audit:read'), (req, res) => {
  audit.record({ type: 'admin', actor: req.principal.username, role: req.principal.role, action: 'audit_view', decision: 'allow', details: { filters: req.query } });
  res.json({ records: audit.query({ ...req.query, limit: Number(req.query.limit) || 300 }), stats: audit.stats() });
});
app.get('/api/audit/response/:id', authMiddleware, requirePerm('audit:read'), (req, res) => {
  res.json({ records: audit.query({ responseId: req.params.id }).reverse(), feedback: audit.feedback.get(req.params.id) || null });
});
app.get('/api/audit/verify', authMiddleware, requirePerm('audit:verify'), (req, res) => res.json(audit.verify()));
app.post('/api/audit/tamper-demo', authMiddleware, requirePerm('admin:demo'), (req, res) => res.json({ tamperedSeq: audit.tamperForDemo() }));
app.get('/api/rbac', authMiddleware, (req, res) => res.json(matrix()));
app.get('/api/health', (req, res) => res.json({ ok: true, engine: llm.enabled() ? `claude:${llm.MODEL}` : 'rules' }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`ShopEase running on http://localhost:${PORT}  (assistant engine: ${llm.enabled() ? `Claude ${llm.MODEL}` : 'rule-based'})`));
}
module.exports = app;
