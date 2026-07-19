/**
 * Parse chat "save contact" phrasings.
 *
 * Supported:
 * - save alice as alice.arc          (docs / canonical: name as handle)
 * - save vendor as 0xabc...          (name as address)
 * - save jack.arc as vendor          (handle as name — common reverse)
 * - save contact jack.arc as vendor  (Telegram-style)
 * - add contact alice alice.arc
 * - alice is alice.arc
 * - save alice                       (name only → ask for handle)
 */

const HANDLE_OR_ADDR = String.raw`(?:0x[a-fA-F0-9]{40}|[a-z0-9][a-z0-9._-]*\.arc)`;
const CONTACT_NAME = String.raw`[a-z][a-z0-9_-]{0,63}`;

export type ParsedContactSave = {
  name: string;
  address: string | null;
};

export function parseContactSaveMessage(message: string): ParsedContactSave | null {
  const t = message.replace(/\s+/g, ' ').trim();
  if (!t) return null;

  // save contact <handle|0x> as <name>
  let match = t.match(
    new RegExp(`^save\\s+contact\\s+(${HANDLE_OR_ADDR})\\s+as\\s+(${CONTACT_NAME})\\b`, 'i'),
  );
  if (match) {
    return { name: match[2].toLowerCase(), address: match[1] };
  }

  // save <handle|0x> as <name>  (reversed — must run before name-as-handle)
  match = t.match(new RegExp(`^save\\s+(${HANDLE_OR_ADDR})\\s+as\\s+(${CONTACT_NAME})\\b`, 'i'));
  if (match) {
    return { name: match[2].toLowerCase(), address: match[1] };
  }

  // save <name> as <handle|0x>
  match = t.match(new RegExp(`^save\\s+(${CONTACT_NAME})\\s+as\\s+(${HANDLE_OR_ADDR})\\b`, 'i'));
  if (match) {
    return { name: match[1].toLowerCase(), address: match[2] };
  }

  // add contact <name> <handle|0x>
  match = t.match(new RegExp(`^add\\s+contact\\s+(${CONTACT_NAME})\\s+(${HANDLE_OR_ADDR})\\b`, 'i'));
  if (match) {
    return { name: match[1].toLowerCase(), address: match[2] };
  }

  // <name> is <handle|0x>
  match = t.match(new RegExp(`^(${CONTACT_NAME})\\s+is\\s+(${HANDLE_OR_ADDR})\\b`, 'i'));
  if (match) {
    return { name: match[1].toLowerCase(), address: match[2] };
  }

  // save [contact] <name>
  match = t.match(new RegExp(`^save\\s+(?:contact\\s+)?(${CONTACT_NAME})$`, 'i'));
  if (match) {
    return { name: match[1].toLowerCase(), address: null };
  }

  return null;
}

export function looksLikeContactSaveMessage(message: string): boolean {
  const t = message.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (parseContactSaveMessage(t)) return true;
  return /^add\s+contact\b/i.test(t) || /^save\s+contact\b/i.test(t);
}
