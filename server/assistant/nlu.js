// Deterministic NLU: intent classification + entity extraction.
// Used as the default engine (no API key needed) and as a fallback if the LLM is unavailable.

const INTENTS = [
  { name: 'help', patterns: [/^(hi|hello|hey|help|what can you do|menu)\b/i] },
  { name: 'audit_query', patterns: [/\baudit\b/i, /access (denied|logs?)/i, /who (accessed|viewed)/i] },
  { name: 'customer_search', patterns: [/\b(find|look ?up|search)\s+(a\s+)?customer/i, /\bcustomer\s+(named|called)\b/i] },
  { name: 'loyalty_adjust', patterns: [/\b(add|give|credit)\b.*\bpoints?\b/i] },
  { name: 'cancel_order', patterns: [/\bcancel\b/i] },
  { name: 'create_return', patterns: [/\b(return|refund|send (it )?back|exchange)\b/i] },
  { name: 'track_order', patterns: [/\b(track|tracking|where('?s| is) my|shipping status|deliver(y|ed)?|arrive|eta|when will)\b/i] },
  { name: 'price_alert', patterns: [/\b(alert|notify|let me know|tell me) .*\b(price|drops?|cheaper|below|under)\b/i, /\bprice (alert|drop alert)\b/i] },
  { name: 'price_history', patterns: [/\bprice (history|trend|chart|graph)\b/i, /\b(90|ninety)[- ]?days?\b/i, /\bhistorical price\b/i, /\bgood (deal|price|time to buy)\b/i, /\bshould i (buy|wait)\b/i, /\bprice (changed|change)\b/i] },
  { name: 'tickets', patterns: [/\b(my )?(support )?tickets?\b(?!.*\b(open|raise|create|file)\b)/i] },
  { name: 'create_ticket', patterns: [/\b(complain|complaint|talk to (a |an )?(human|agent|person)|speak to|raise|open|create|file)\b.*\b(ticket|issue|case|complaint|agent|human)?/i, /\b(damaged|broken|missing|wrong item|defective)\b/i] },
  { name: 'wishlist', patterns: [/\bwish ?list\b/i, /\bsave (it|this) for later\b/i] },
  { name: 'profile', patterns: [/\b(my )?(profile|account|loyalty|points|rewards|tier|membership)\b/i, /\bcustomer 360\b/i] },
  { name: 'recommendations', patterns: [/\b(recommend|suggest|recommendation|ideas?|what should i buy|gift|similar|goes well|bought together|for you|picks?)\b/i] },
  { name: 'order_details', patterns: [/\b(details?|receipt|invoice|what('?s| is) in)\b.*\bORD-\d+/i] },
  { name: 'order_history', patterns: [/\b(my )?(orders?|order history|purchase history|purchases|bought|past orders?|previous orders?|reorder|buy again)\b/i, /\bwhat did i (buy|order)\b/i] },
  { name: 'product_search', patterns: [/\b(find|search|show|looking for|do you have|need|buy|shop for|in stock)\b/i] },
];

const CATEGORY_WORDS = {
  Household: /\b(household|home|cleaning|laundry|kitchen supplies)\b/i,
  Grocery: /\b(grocery|groceries|food|pantry|dairy|produce|snacks?|breakfast)\b/i,
  'Kids Playsets': /\b(kids?|children|toys?|playsets?|play ?set|toddler)\b/i,
};

function extractEntities(text) {
  const e = {};
  const ord = text.match(/\bORD-?\s?(\d{5})\b/i);
  if (ord) e.orderId = `ORD-${ord[1]}`;
  const cust = text.match(/\bC\d{4}\b/i);
  if (cust) e.customerId = cust[0].toUpperCase();
  const sku = text.match(/\b(HH|GR|KP)-\d{4}\b/i);
  if (sku) e.productId = sku[0].toUpperCase();
  const price = text.match(/(?:under|below|less than|<|to|at)\s*\$?\s?(\d+(?:\.\d{1,2})?)/i) || text.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (price) e.price = parseFloat(price[1]);
  const days = text.match(/\b(?:last|past)\s+(\d+)\s+days?\b/i);
  if (days) e.days = parseInt(days[1], 10);
  else if (/\blast (month|30 days)\b/i.test(text)) e.days = 30;
  else if (/\blast week\b/i.test(text)) e.days = 7;
  else if (/\blast (quarter|3 months)\b/i.test(text)) e.days = 90;
  const pts = text.match(/\b(\d{2,5})\s*(?:loyalty\s*)?points?\b/i);
  if (pts) e.points = parseInt(pts[1], 10);
  for (const [cat, re] of Object.entries(CATEGORY_WORDS)) if (re.test(text)) { e.category = cat; break; }
  const status = text.match(/\b(delivered|cancelled|canceled|returned|processing|shipped|in transit)\b/i);
  if (status) e.status = status[1].toLowerCase().replace('canceled', 'cancelled').replace('in transit', 'shipped');
  const name = text.match(/\bcustomer\s+(?:named\s+|called\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (name && !/^C\d{4}$/.test(name[1])) e.customerName = name[1];
  e.refersToPrevious = /\b(it|that|this one|that one|the same|them)\b/i.test(text);
  return e;
}

// Strip intent words to obtain the product query portion of the message.
function productQuery(text) {
  return text
    .replace(/\b(ORD|C|HH|GR|KP)-?\d+\b/gi, ' ')
    .replace(/\$?\d+(\.\d+)?/g, ' ')
    .replace(/\b(show|me|the|price|history|trend|chart|of|for|find|search|do you have|looking for|i need|need|buy|shop|recommend|suggest|similar to|alert|notify|when|drops?|below|under|less than|last|days?|90|ninety|is|it|a|good|deal|what|whats|add|to|my|wishlist|wish list|please|can|you|i|want|some|any|set|an|how|has|changed|let|know|tell|cheaper|than|items?|products?|in stock|ideas?|gifts?|gift)\b/gi, ' ')
    .replace(/[?!.,]/g, ' ')
    .replace(/\b(should|wait|deal|good|time)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function classify(text) {
  for (const intent of INTENTS) {
    if (intent.patterns.some(re => re.test(text))) {
      return { intent: intent.name, confidence: 0.9 };
    }
  }
  return { intent: 'product_search', confidence: 0.4 };
}

module.exports = { classify, extractEntities, productQuery };
