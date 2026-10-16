// Role-Based Access Control.
// Permissions are "resource:action[:scope]". Scope "self" means the subject may only act on
// resources it owns (customerId match); "any" allows acting on any customer's data.

const ROLES = {
  customer: {
    description: 'Shopper signed in on the storefront',
    permissions: [
      'catalog:read', 'pricehistory:read', 'recommendations:read',
      'orders:read:self', 'orders:track:self', 'orders:cancel:self', 'returns:create:self',
      'profile:read:self', 'wishlist:write:self', 'alerts:write:self',
      'tickets:create:self', 'tickets:read:self', 'feedback:create',
    ],
  },
  support_agent: {
    description: 'Customer-care agent assisting shoppers',
    permissions: [
      'catalog:read', 'pricehistory:read', 'recommendations:read',
      'customers:search', 'orders:read:any', 'orders:track:any', 'orders:cancel:any', 'returns:create:any',
      'profile:read:any', 'tickets:create:any', 'tickets:read:any', 'tickets:update',
      'loyalty:adjust', 'feedback:create',
    ],
    limits: { 'loyalty:adjust': 500 }, // max points per adjustment
  },
  auditor: {
    description: 'Compliance reviewer — read-only access to audit trail',
    permissions: ['audit:read', 'audit:verify', 'feedback:read', 'catalog:read', 'pricehistory:read'],
  },
  admin: {
    description: 'Platform administrator',
    permissions: ['*'],
    limits: { 'loyalty:adjust': 10000 },
  },
};

// PII fields visible unmasked only to these roles.
const PII_UNMASK_ROLES = new Set(['admin']);

function hasPermission(role, perm) {
  const def = ROLES[role];
  if (!def) return false;
  if (def.permissions.includes('*')) return true;
  return def.permissions.includes(perm);
}

/**
 * Authorise an action against an (optional) owned resource.
 * @returns {{allowed: boolean, reason: string, scope?: string}}
 */
function authorize(principal, resource, action, ownerCustomerId) {
  const base = `${resource}:${action}`;
  if (hasPermission(principal.role, base)) return { allowed: true, reason: `role ${principal.role} has ${base}` };
  if (hasPermission(principal.role, `${base}:any`)) return { allowed: true, scope: 'any', reason: `role ${principal.role} has ${base}:any` };
  if (hasPermission(principal.role, `${base}:self`)) {
    if (ownerCustomerId === undefined || ownerCustomerId === principal.customerId) {
      return { allowed: true, scope: 'self', reason: `role ${principal.role} has ${base}:self` };
    }
    return { allowed: false, reason: `${base}:self does not cover resources owned by another customer` };
  }
  return { allowed: false, reason: `role ${principal.role} lacks ${base}` };
}

function limitFor(role, perm) {
  return ROLES[role]?.limits?.[perm] ?? 0;
}

function canSeePII(role) {
  return PII_UNMASK_ROLES.has(role);
}

function matrix() {
  const all = new Set();
  Object.values(ROLES).forEach(r => r.permissions.forEach(p => p !== '*' && all.add(p)));
  const perms = [...all].sort();
  return {
    roles: Object.keys(ROLES).map(r => ({ role: r, description: ROLES[r].description })),
    permissions: perms,
    grants: Object.fromEntries(Object.keys(ROLES).map(r => [r, perms.filter(p => hasPermission(r, p))])),
  };
}

class AccessDeniedError extends Error {
  constructor(reason) { super(reason); this.name = 'AccessDeniedError'; }
}

module.exports = { ROLES, authorize, hasPermission, limitFor, canSeePII, matrix, AccessDeniedError };
