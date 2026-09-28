// Share codes: a combo packed into a short "FF1-…" string you can paste to a
// friend. Secret settings (e.g. webhook URLs) are blanked before sharing.

const PREFIX = 'FF1-';
const MAX_CODE_LENGTH = 20000;

const toBase64Url = (text) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (code) => {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
};

// cards: the card catalog, used to find which settings are secret.
export function encodeCombo(combo, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let stripped = false;
  const slot = ({ card, params = {} }) => {
    const out = { ...params };
    for (const p of byId.get(card)?.params ?? []) {
      if (p.secret && out[p.key]) {
        out[p.key] = '';
        stripped = true;
      }
    }
    return [card, out];
  };
  const payload = {
    n: combo.name,
    t: slot(combo.trigger),
    c: combo.conditions.map(slot),
    a: combo.actions.map(slot),
  };
  return { code: PREFIX + toBase64Url(JSON.stringify(payload)), stripped };
}

// Returns a forge-ready combo, or throws with a message fit for the user.
export function decodeCombo(code, cards) {
  const text = String(code ?? '').trim();
  if (!text.startsWith(PREFIX) || text.length > MAX_CODE_LENGTH) throw new Error("That doesn't look like a FlowForge share code.");
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(text.slice(PREFIX.length)));
  } catch {
    throw new Error('That share code is damaged. Try copying it again.');
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const slot = (raw, type) => {
    const [id, params] = Array.isArray(raw) ? raw : [];
    const card = byId.get(id);
    if (!card || card.type !== type) throw new Error(`The code uses a card this version doesn't know (${id ?? 'unknown'}).`);
    const clean = {};
    for (const p of card.params) {
      const value = params?.[p.key];
      clean[p.key] = typeof value === 'string' || typeof value === 'number' ? value : p.default ?? '';
    }
    return { card: id, params: clean };
  };
  if (!Array.isArray(payload?.c) || !Array.isArray(payload?.a)) throw new Error('That share code is damaged. Try copying it again.');
  return {
    name: String(payload.n ?? 'Shared combo').slice(0, 60),
    trigger: slot(payload.t, 'trigger'),
    conditions: payload.c.map((c) => slot(c, 'condition')),
    actions: payload.a.map((a) => slot(a, 'action')),
  };
}
