// Deterministic mock data for the demo retailer "ShopEase".
// Everything is generated relative to server start time so dates always look fresh.

const DAY = 24 * 60 * 60 * 1000;

// Small seeded PRNG (mulberry32) so data is identical on every boot.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  // Household
  { id: 'HH-1001', name: 'UltraClean Laundry Detergent 2.5L', category: 'Household', sub: 'Laundry', brand: 'UltraClean', price: 14.99, rating: 4.6, stock: 120, icon: '🧺', tags: ['detergent', 'laundry', 'washing', 'clothes'] },
  { id: 'HH-1002', name: 'SparkleDish Dishwashing Liquid 750ml', category: 'Household', sub: 'Kitchen', brand: 'SparkleDish', price: 3.49, rating: 4.4, stock: 300, icon: '🧴', tags: ['dish', 'soap', 'dishwashing', 'kitchen'] },
  { id: 'HH-1003', name: 'CloudSoft Toilet Paper 24 Rolls', category: 'Household', sub: 'Paper', brand: 'CloudSoft', price: 18.99, rating: 4.7, stock: 80, icon: '🧻', tags: ['toilet', 'paper', 'tissue', 'bathroom'] },
  { id: 'HH-1004', name: 'QuickAbsorb Paper Towels 8 Pack', category: 'Household', sub: 'Paper', brand: 'QuickAbsorb', price: 11.49, rating: 4.5, stock: 95, icon: '🧻', tags: ['paper', 'towels', 'kitchen', 'cleaning'] },
  { id: 'HH-1005', name: 'StrongHold Trash Bags 13 Gal (80 ct)', category: 'Household', sub: 'Kitchen', brand: 'StrongHold', price: 12.99, rating: 4.3, stock: 150, icon: '🗑️', tags: ['trash', 'garbage', 'bags', 'bin'] },
  { id: 'HH-1006', name: 'FreshHome All-Purpose Cleaner Spray', category: 'Household', sub: 'Cleaning', brand: 'FreshHome', price: 4.99, rating: 4.2, stock: 210, icon: '🧽', tags: ['cleaner', 'spray', 'cleaning', 'surface'] },
  { id: 'HH-1007', name: 'ScrubPro Kitchen Sponges (12 pk)', category: 'Household', sub: 'Cleaning', brand: 'ScrubPro', price: 6.99, rating: 4.1, stock: 175, icon: '🧽', tags: ['sponge', 'scrub', 'kitchen', 'cleaning'] },
  { id: 'HH-1008', name: 'BrightLife LED Bulbs 60W eq. (6 pk)', category: 'Household', sub: 'Lighting', brand: 'BrightLife', price: 15.99, rating: 4.6, stock: 60, icon: '💡', tags: ['led', 'bulb', 'light', 'lighting'] },
  { id: 'HH-1009', name: 'StackSmart Food Storage Containers (20 pc)', category: 'Household', sub: 'Kitchen', brand: 'StackSmart', price: 24.99, rating: 4.5, stock: 45, icon: '🥡', tags: ['storage', 'container', 'kitchen', 'food'] },
  { id: 'HH-1010', name: 'UltraClean Laundry Pods (42 ct)', category: 'Household', sub: 'Laundry', brand: 'UltraClean', price: 13.99, rating: 4.7, stock: 140, icon: '🫧', tags: ['laundry', 'pods', 'detergent', 'washing'] },
  { id: 'HH-1011', name: 'SpinEasy Microfiber Mop & Bucket', category: 'Household', sub: 'Cleaning', brand: 'SpinEasy', price: 34.99, rating: 4.4, stock: 30, icon: '🪣', tags: ['mop', 'bucket', 'floor', 'cleaning'] },
  { id: 'HH-1012', name: 'BreezeAir Air Freshener (3 pk)', category: 'Household', sub: 'Cleaning', brand: 'BreezeAir', price: 7.49, rating: 4.0, stock: 160, icon: '🌸', tags: ['air', 'freshener', 'scent', 'fragrance'] },

  // Grocery
  { id: 'GR-2001', name: 'GreenPasture Organic Whole Milk 1 Gal', category: 'Grocery', sub: 'Dairy', brand: 'GreenPasture', price: 5.79, rating: 4.7, stock: 200, icon: '🥛', tags: ['milk', 'dairy', 'organic'] },
  { id: 'GR-2002', name: 'SunnyFarm Large Brown Eggs (12)', category: 'Grocery', sub: 'Dairy', brand: 'SunnyFarm', price: 4.29, rating: 4.6, stock: 220, icon: '🥚', tags: ['eggs', 'breakfast', 'protein'] },
  { id: 'GR-2003', name: 'Baker\'s Choice Whole Wheat Bread', category: 'Grocery', sub: 'Bakery', brand: 'Baker\'s Choice', price: 3.29, rating: 4.3, stock: 140, icon: '🍞', tags: ['bread', 'bakery', 'wheat', 'breakfast'] },
  { id: 'GR-2004', name: 'Tropica Organic Bananas (bunch)', category: 'Grocery', sub: 'Produce', brand: 'Tropica', price: 1.99, rating: 4.5, stock: 400, icon: '🍌', tags: ['banana', 'fruit', 'produce', 'organic'] },
  { id: 'GR-2005', name: 'RoyalGrain Basmati Rice 10 lb', category: 'Grocery', sub: 'Pantry', brand: 'RoyalGrain', price: 16.99, rating: 4.8, stock: 75, icon: '🍚', tags: ['rice', 'basmati', 'pantry', 'grain'] },
  { id: 'GR-2006', name: 'Mediterra Extra Virgin Olive Oil 1L', category: 'Grocery', sub: 'Pantry', brand: 'Mediterra', price: 12.49, rating: 4.6, stock: 90, icon: '🫒', tags: ['olive', 'oil', 'cooking', 'pantry'] },
  { id: 'GR-2007', name: 'MorningPeak Ground Coffee 24 oz', category: 'Grocery', sub: 'Beverages', brand: 'MorningPeak', price: 13.99, rating: 4.5, stock: 110, icon: '☕', tags: ['coffee', 'beverage', 'breakfast', 'caffeine'] },
  { id: 'GR-2008', name: 'CrunchyOats Honey Cereal 18 oz', category: 'Grocery', sub: 'Breakfast', brand: 'CrunchyOats', price: 4.79, rating: 4.2, stock: 160, icon: '🥣', tags: ['cereal', 'breakfast', 'oats', 'kids'] },
  { id: 'GR-2009', name: 'NuttyGood Creamy Peanut Butter 40 oz', category: 'Grocery', sub: 'Pantry', brand: 'NuttyGood', price: 7.99, rating: 4.7, stock: 130, icon: '🥜', tags: ['peanut', 'butter', 'spread', 'protein'] },
  { id: 'GR-2010', name: 'Nonna\'s Spaghetti Pasta (4 pk)', category: 'Grocery', sub: 'Pantry', brand: 'Nonna\'s', price: 5.49, rating: 4.4, stock: 180, icon: '🍝', tags: ['pasta', 'spaghetti', 'dinner', 'pantry'] },
  { id: 'GR-2011', name: 'TrailMix Raw Almonds 2 lb', category: 'Grocery', sub: 'Snacks', brand: 'TrailMix', price: 14.49, rating: 4.6, stock: 70, icon: '🌰', tags: ['almonds', 'nuts', 'snack', 'healthy'] },
  { id: 'GR-2012', name: 'SunSqueeze Orange Juice 52 oz', category: 'Grocery', sub: 'Beverages', brand: 'SunSqueeze', price: 4.99, rating: 4.3, stock: 150, icon: '🧃', tags: ['juice', 'orange', 'beverage', 'breakfast'] },

  // Kids playsets
  { id: 'KP-3001', name: 'BrickBuild City Fire Station (540 pcs)', category: 'Kids Playsets', sub: 'Building', brand: 'BrickBuild', price: 59.99, rating: 4.8, stock: 25, icon: '🚒', age: '6-12', tags: ['building', 'bricks', 'blocks', 'fire', 'construction', 'lego'] },
  { id: 'KP-3002', name: 'DreamCottage Wooden Dollhouse', category: 'Kids Playsets', sub: 'Pretend Play', brand: 'DreamCottage', price: 89.99, rating: 4.7, stock: 12, icon: '🏠', age: '3-8', tags: ['dollhouse', 'doll', 'pretend', 'wooden'] },
  { id: 'KP-3003', name: 'RailRoad Wooden Train Set (100 pcs)', category: 'Kids Playsets', sub: 'Vehicles', brand: 'RailRoad', price: 49.99, rating: 4.6, stock: 30, icon: '🚂', age: '3-7', tags: ['train', 'railway', 'wooden', 'vehicles'] },
  { id: 'KP-3004', name: 'LittleChef Play Kitchen Set', category: 'Kids Playsets', sub: 'Pretend Play', brand: 'LittleChef', price: 79.99, rating: 4.5, stock: 18, icon: '🍳', age: '3-8', tags: ['kitchen', 'cooking', 'pretend', 'chef'] },
  { id: 'KP-3005', name: 'TinyMedic Doctor Kit (24 pcs)', category: 'Kids Playsets', sub: 'Pretend Play', brand: 'TinyMedic', price: 24.99, rating: 4.4, stock: 55, icon: '🩺', age: '3-6', tags: ['doctor', 'medical', 'pretend', 'role play'] },
  { id: 'KP-3006', name: 'JurassicQuest Dinosaur World Playset', category: 'Kids Playsets', sub: 'Figures', brand: 'JurassicQuest', price: 39.99, rating: 4.6, stock: 40, icon: '🦖', age: '4-10', tags: ['dinosaur', 'dino', 'figures', 'jurassic'] },
  { id: 'KP-3007', name: 'ArtNest 3-in-1 Kids Art Easel', category: 'Kids Playsets', sub: 'Arts & Crafts', brand: 'ArtNest', price: 44.99, rating: 4.5, stock: 22, icon: '🎨', age: '3-10', tags: ['art', 'easel', 'drawing', 'painting', 'craft'] },
  { id: 'KP-3008', name: 'MagnaBuild Magnetic Tiles (100 pcs)', category: 'Kids Playsets', sub: 'Building', brand: 'MagnaBuild', price: 69.99, rating: 4.9, stock: 35, icon: '🧲', age: '3-10', tags: ['magnetic', 'tiles', 'building', 'stem', 'blocks'] },
  { id: 'KP-3009', name: 'CastleKeep Kids Play Tent', category: 'Kids Playsets', sub: 'Outdoor', brand: 'CastleKeep', price: 32.99, rating: 4.3, stock: 28, icon: '⛺', age: '3-9', tags: ['tent', 'castle', 'play', 'indoor', 'outdoor'] },
  { id: 'KP-3010', name: 'SpaceVoyager Rocket Station Playset', category: 'Kids Playsets', sub: 'Building', brand: 'BrickBuild', price: 74.99, rating: 4.7, stock: 15, icon: '🚀', age: '7-12', tags: ['space', 'rocket', 'building', 'bricks', 'stem'] },
  { id: 'KP-3011', name: 'FarmFriends Barn & Animals Playset', category: 'Kids Playsets', sub: 'Figures', brand: 'FarmFriends', price: 29.99, rating: 4.5, stock: 38, icon: '🐄', age: '2-6', tags: ['farm', 'animals', 'barn', 'figures'] },
  { id: 'KP-3012', name: 'SpeedTrack Race Car Garage', category: 'Kids Playsets', sub: 'Vehicles', brand: 'SpeedTrack', price: 54.99, rating: 4.4, stock: 20, icon: '🏎️', age: '3-8', tags: ['cars', 'garage', 'racing', 'vehicles', 'track'] },
];

// Frequently-bought-together hints used by the recommender.
const AFFINITY = {
  'HH-1001': ['HH-1010', 'HH-1012'],
  'HH-1002': ['HH-1007', 'HH-1004'],
  'HH-1003': ['HH-1004', 'HH-1005'],
  'GR-2001': ['GR-2008', 'GR-2002'],
  'GR-2002': ['GR-2003', 'GR-2001'],
  'GR-2003': ['GR-2009', 'GR-2002'],
  'GR-2007': ['GR-2001', 'GR-2012'],
  'GR-2010': ['GR-2006'],
  'KP-3001': ['KP-3010', 'KP-3008'],
  'KP-3002': ['KP-3004', 'KP-3011'],
  'KP-3003': ['KP-3012', 'KP-3001'],
  'KP-3004': ['KP-3005', 'KP-3002'],
  'KP-3008': ['KP-3001', 'KP-3010'],
};

const CUSTOMERS = [
  {
    id: 'C1001', name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+1-415-555-0142',
    tier: 'Gold', loyaltyPoints: 4820, memberSince: '2021-03-14', lifetimeValue: 0,
    address: '221 Market St, Apt 5B, San Francisco, CA 94105',
    preferences: { categories: ['Grocery', 'Kids Playsets'], channel: 'email', kidsAges: [4, 7] },
    segments: ['Young Family', 'Frequent Grocery Buyer', 'High Value'],
    wishlist: ['KP-3008', 'GR-2011'],
  },
  {
    id: 'C1002', name: 'James Miller', email: 'james.miller@example.com', phone: '+1-312-555-0199',
    tier: 'Silver', loyaltyPoints: 1630, memberSince: '2022-08-02', lifetimeValue: 0,
    address: '78 Lakeshore Dr, Chicago, IL 60611',
    preferences: { categories: ['Household'], channel: 'sms', kidsAges: [] },
    segments: ['Household Essentials', 'Deal Seeker'],
    wishlist: ['HH-1011'],
  },
  {
    id: 'C1003', name: 'Aisha Khan', email: 'aisha.khan@example.com', phone: '+1-206-555-0175',
    tier: 'Bronze', loyaltyPoints: 540, memberSince: '2024-01-20', lifetimeValue: 0,
    address: '1500 Pine St, Seattle, WA 98101',
    preferences: { categories: ['Kids Playsets', 'Household'], channel: 'push', kidsAges: [3] },
    segments: ['New Parent', 'Gift Buyer'],
    wishlist: ['KP-3002'],
  },
  {
    id: 'C1004', name: 'Diego Lopez', email: 'diego.lopez@example.com', phone: '+1-512-555-0110',
    tier: 'Silver', loyaltyPoints: 2210, memberSince: '2023-05-09', lifetimeValue: 0,
    address: '9 Congress Ave, Austin, TX 78701',
    preferences: { categories: ['Grocery'], channel: 'email', kidsAges: [] },
    segments: ['Organic Shopper', 'Subscription Candidate'],
    wishlist: [],
  },
];

// Demo login principals. In production these would come from an IdP (OIDC/SAML).
const USERS = [
  { username: 'priya', displayName: 'Priya Sharma', role: 'customer', customerId: 'C1001' },
  { username: 'james', displayName: 'James Miller', role: 'customer', customerId: 'C1002' },
  { username: 'agent.sam', displayName: 'Sam Patel (Support)', role: 'support_agent' },
  { username: 'auditor.ria', displayName: 'Ria Gomez (Compliance)', role: 'auditor' },
  { username: 'admin.alex', displayName: 'Alex Chen (Admin)', role: 'admin' },
];

const CARRIERS = ['UPS', 'FedEx', 'USPS', 'ShopEase Express'];

// Products with a deliberate "price just dropped" story for the demo.
const DROP_STORIES = { 'KP-3008': 0.16, 'GR-2007': 0.12, 'HH-1001': 0.10, 'KP-3003': 0.14 };
// Products whose price recently went up (good candidates for price alerts).
const RISE_STORIES = { 'GR-2005': 0.10, 'KP-3002': 0.08 };

function buildPriceHistory(now) {
  const history = {};
  PRODUCTS.forEach((p, idx) => {
    const r = rng(1000 + idx);
    const base = p.price;
    const drop = DROP_STORIES[p.id] || 0;
    const rise = RISE_STORIES[p.id] || 0;
    // Price level before the recent change; drift towards it with small daily noise.
    const before = drop ? base * (1 + drop) : rise ? base / (1 + rise) : base;
    const changeDay = 82 + Math.floor(r() * 4); // change lands in the final week
    const promoStart = 10 + Math.floor(r() * 50);
    const promoLen = 4 + Math.floor(r() * 5);
    const promoDepth = drop ? 0.05 : 0.08 + r() * 0.12;
    let level = before * (1 + (r() - 0.5) * 0.04);
    const points = [];
    for (let dayIdx = 0; dayIdx < 90; dayIdx++) {
      const target = dayIdx >= changeDay ? base : before;
      level += (target - level) * 0.25 + (r() - 0.5) * base * 0.012;
      let shown = level;
      const onPromo = dayIdx >= promoStart && dayIdx < promoStart + promoLen;
      if (onPromo) shown = level * (1 - promoDepth);
      if (dayIdx >= changeDay && (drop || rise)) shown = base;
      points.push({ date: new Date(now - (89 - dayIdx) * DAY).toISOString().slice(0, 10), price: +shown.toFixed(2), promo: onPromo });
    }
    points[89].price = base;
    points[89].promo = false;
    history[p.id] = points;
  });
  return history;
}

function trackingEvents(status, placedAt, carrier, r) {
  const ev = [];
  const add = (offsetH, label, location) => ev.push({ ts: new Date(placedAt + offsetH * 3600 * 1000).toISOString(), label, location });
  const hub = ['Oakland, CA', 'Memphis, TN', 'Louisville, KY', 'Dallas, TX', 'Columbus, OH'][Math.floor(r() * 5)];
  add(0, 'Order placed', 'Online');
  if (status === 'Cancelled') { add(3, 'Order cancelled by customer', 'Online'); return ev; }
  add(6, 'Payment confirmed', 'Online');
  if (status === 'Processing') return ev;
  add(20, `Packed and handed to ${carrier}`, 'ShopEase Fulfilment Center, Reno, NV');
  add(34, 'Departed facility', 'Reno, NV');
  if (status === 'Shipped') { add(52, 'In transit', hub); return ev; }
  add(52, 'In transit', hub);
  add(70, 'Arrived at local facility', 'Local delivery hub');
  if (status === 'Out for Delivery') { add(78, 'Out for delivery', 'Local delivery hub'); return ev; }
  add(78, 'Out for delivery', 'Local delivery hub');
  add(84, 'Delivered — left at front door', 'Customer address');
  if (status === 'Returned') { add(240, 'Return received at warehouse', 'Reno, NV'); add(260, 'Refund issued to original payment method', 'Online'); }
  return ev;
}

function buildOrders(now) {
  const orders = [];
  let seq = 50120;
  const plans = {
    C1001: { count: 10, cats: ['Grocery', 'Grocery', 'Kids Playsets', 'Household'] },
    C1002: { count: 8, cats: ['Household', 'Household', 'Grocery'] },
    C1003: { count: 5, cats: ['Kids Playsets', 'Household'] },
    C1004: { count: 6, cats: ['Grocery', 'Grocery', 'Household'] },
  };
  Object.entries(plans).forEach(([cid, plan], ci) => {
    const r = rng(77 + ci);
    for (let i = 0; i < plan.count; i++) {
      // Most recent orders first in the loop so status can depend on age.
      const ageDays = i === 0 ? 0.6 : i === 1 ? 2 : i === 2 ? 4 : Math.floor(6 + i * 11 + r() * 8);
      const placedAt = now - ageDays * DAY;
      let status = 'Delivered';
      if (i === 0) status = cid === 'C1002' ? 'Processing' : 'Out for Delivery';
      else if (i === 1) status = 'Shipped';
      else if (i === 2 && cid === 'C1001') status = 'Delivered';
      else if (i === 4 && (cid === 'C1001' || cid === 'C1004')) status = 'Returned';
      else if (i === 5 && cid === 'C1002') status = 'Cancelled';

      const cat = plan.cats[Math.floor(r() * plan.cats.length)];
      const pool = PRODUCTS.filter(p => p.category === cat);
      const nItems = 1 + Math.floor(r() * 3);
      const items = [];
      const used = new Set();
      for (let k = 0; k < nItems; k++) {
        const p = pool[Math.floor(r() * pool.length)];
        if (used.has(p.id)) continue;
        used.add(p.id);
        const qty = cat === 'Kids Playsets' ? 1 : 1 + Math.floor(r() * 3);
        items.push({ productId: p.id, name: p.name, icon: p.icon, qty, unitPrice: p.price });
      }
      const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      const shipping = subtotal > 35 ? 0 : 5.99;
      const tax = +(subtotal * 0.0825).toFixed(2);
      const carrier = CARRIERS[Math.floor(r() * CARRIERS.length)];
      const id = `ORD-${seq++}`;
      const deliveredEta = new Date(placedAt + 4 * DAY).toISOString();
      orders.push({
        id, customerId: cid, placedAt: new Date(placedAt).toISOString(), status, items,
        subtotal: +subtotal.toFixed(2), shipping, tax, total: +(subtotal + shipping + tax).toFixed(2),
        payment: { method: ['Visa', 'Mastercard', 'Amex', 'PayPal'][Math.floor(r() * 4)], last4: String(1000 + Math.floor(r() * 9000)) },
        shipment: status === 'Cancelled' ? null : {
          carrier, trackingNumber: `${carrier.slice(0, 2).toUpperCase()}${Math.floor(100000000 + r() * 899999999)}`,
          eta: deliveredEta, events: trackingEvents(status, placedAt, carrier, r),
        },
      });
    }
  });
  orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  return orders;
}

function buildTickets(now) {
  return [
    { id: 'TCK-7001', customerId: 'C1001', orderId: null, subject: 'Damaged packaging on dollhouse', status: 'Resolved', priority: 'Medium', createdAt: new Date(now - 40 * DAY).toISOString(), assignee: 'agent.sam', notes: ['Replacement shipped', 'Customer confirmed receipt'] },
    { id: 'TCK-7002', customerId: 'C1002', orderId: null, subject: 'Refund not received for cancelled order', status: 'Open', priority: 'High', createdAt: new Date(now - 3 * DAY).toISOString(), assignee: 'agent.sam', notes: ['Escalated to payments team'] },
  ];
}

function buildSeed(now = Date.now()) {
  const orders = buildOrders(now);
  const customers = CUSTOMERS.map(c => ({
    ...c,
    lifetimeValue: +orders.filter(o => o.customerId === c.id && o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0).toFixed(2),
  }));
  return {
    products: PRODUCTS,
    affinity: AFFINITY,
    customers,
    users: USERS,
    orders,
    tickets: buildTickets(now),
    priceHistory: buildPriceHistory(now),
    priceAlerts: [],
    returns: [],
  };
}

module.exports = { buildSeed, DAY };
