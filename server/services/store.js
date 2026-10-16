// In-memory data store (stand-in for OMS / PIM / CRM / pricing databases).
const { buildSeed } = require('../data/seed');

const db = buildSeed();

const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
const productIndex = byId(db.products);

function product(id) { return productIndex[id?.toUpperCase?.()] || null; }
function customer(id) { return db.customers.find(c => c.id === id?.toUpperCase?.()) || null; }
function order(id) { return db.orders.find(o => o.id === id?.toUpperCase?.()) || null; }

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'me', 'my', 'show', 'price', 'history', 'find', 'search', 'is', 'what', 'some', 'any', 'and', 'to', 'in', 'on', 'with', 'do', 'you', 'have', 'last', 'days', 'trend', 'please', 'get', 'buy', 'want', 'looking', 'similar', 'like', 'recommend', 'suggest', 'products', 'product', 'items', 'item', 'it', 'that', 'this', 'how', 'has', 'changed', 'cheap', 'cheaper', 'under', 'below', 'kids', 'kid', 'toys', 'toy']);

function tokens(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t));
}

// Lightweight relevance search across name, brand, tags, category.
function searchProducts(query, { category, maxPrice, limit = 6 } = {}) {
  const qt = tokens(query);
  let pool = db.products;
  if (category) pool = pool.filter(p => p.category.toLowerCase() === category.toLowerCase());
  if (maxPrice) pool = pool.filter(p => p.price <= maxPrice);
  if (!qt.length) return pool.slice(0, limit);
  const scored = pool.map(p => {
    const hay = `${p.name} ${p.brand} ${p.tags.join(' ')} ${p.sub} ${p.category}`.toLowerCase();
    let score = 0;
    qt.forEach(t => {
      const stem = t.replace(/(es|s)$/, '');
      if (p.tags.includes(t) || p.tags.includes(stem)) score += 3;
      else if (hay.includes(stem) && stem.length > 2) score += 2;
    });
    return { p, score: score + p.rating / 10 };
  }).filter(x => x.score >= 2);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}

module.exports = { db, product, customer, order, searchProducts, tokens };
