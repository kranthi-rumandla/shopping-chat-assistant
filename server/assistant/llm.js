// Optional Claude-powered engine. Enabled when ANTHROPIC_API_KEY is set and ASSISTANT_ENGINE != "rules".
// Claude chooses tools; the tools themselves enforce RBAC, so the model can never exceed the
// signed-in user's permissions (it only sees results the user is allowed to see).
const Anthropic = require('@anthropic-ai/sdk');
const { tools } = require('../services/tools');

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 4;
let client = null;

function enabled() {
  if (process.env.ASSISTANT_ENGINE === 'rules') return false;
  if (!process.env.ANTHROPIC_API_KEY) return false;
  client = client || new Anthropic();
  return true;
}

const toolDefs = Object.entries(tools).map(([name, t]) => ({ name, description: t.description, input_schema: t.schema }));

function systemPrompt(principal, context) {
  return [
    'You are Ema, the shopping assistant embedded in the ShopEase retail website.',
    'Help with product search, order history, order tracking, cancellations, returns, 90-day price history, recommendations, wishlist, price alerts, loyalty and support tickets.',
    'Always use the tools for facts about orders, products, prices and customers — never invent order IDs, prices or tracking data.',
    'Reply in 1-3 short sentences; the UI renders rich cards from tool results, so do not repeat tables or long lists.',
    'If a tool result says permission was denied, tell the user politely that it is not permitted for their role.',
    'Before cancelling an order or creating a return, make sure the user clearly asked for that specific order.',
    `Signed-in user: ${principal.name} (role: ${principal.role}${principal.customerId ? `, customerId: ${principal.customerId}` : ''}).`,
    `Conversation context (last referenced entities): ${JSON.stringify(context)}.`,
  ].join('\n');
}

async function respond({ principal, text, history, context, runTool }) {
  const messages = history.slice(-10).map(h => ({ role: h.role, content: h.text }));
  // History must start with a user turn and alternate.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: text });

  const cards = []; const toolCalls = []; const entities = {};
  let intent = 'llm_answer';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: systemPrompt(principal, context),
      tools: toolDefs,
      messages,
    });

    if (response.stop_reason === 'refusal') return { text: "Sorry, I can't help with that request.", cards, toolCalls, entities, intent: 'refusal' };

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { text: reply || 'Done.', cards, toolCalls, entities, intent };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results = toolUses.map(tu => {
      const r = runTool(tu.name, tu.input);
      intent = tu.name;
      toolCalls.push({ name: tu.name, input: tu.input, ok: r.ok, denied: !!r.denied });
      if (r.card) cards.push(r.card);
      if (r.entities) Object.assign(entities, r.entities);
      // The model only gets a compact view: summary text + card data.
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ ok: r.ok, denied: !!r.denied, summary: r.text, data: r.card?.data && summarizeData(r.card) }), is_error: !r.ok };
    });
    messages.push({ role: 'user', content: results });
  }
  return { text: 'I gathered the details above.', cards, toolCalls, entities, intent };
}

// Keep tool payloads small (e.g. drop 90 daily price points).
function summarizeData(card) {
  if (card.type === 'price_history') return { product: card.data.product.name, stats: card.data.stats, verdict: card.data.verdict };
  if (Array.isArray(card.data)) return card.data.slice(0, 8).map(d => ({ id: d.id, name: d.name, status: d.status, total: d.total, price: d.price, reason: d.reason }));
  return card.data;
}

module.exports = { enabled, respond, MODEL };
