// Minimal signed-token auth (HMAC-SHA256, JWT-like) so the demo has no external IdP dependency.
// In production: replace with OIDC (Okta / Azure AD / Cognito) and validate JWTs from the IdP.
const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const TTL_MS = 8 * 60 * 60 * 1000;

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function issueToken(user) {
  const payload = b64(JSON.stringify({
    sub: user.username, role: user.role, customerId: user.customerId || null,
    name: user.displayName, exp: Date.now() + TTL_MS,
  }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (claims.exp < Date.now()) return null;
  return claims;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const claims = verifyToken(header.replace(/^Bearer\s+/i, ''));
  if (!claims) return res.status(401).json({ error: 'Unauthenticated' });
  req.principal = { username: claims.sub, role: claims.role, customerId: claims.customerId, name: claims.name };
  next();
}

module.exports = { issueToken, verifyToken, authMiddleware };
