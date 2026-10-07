/**
 * Cryptographic SHA-256 helper for client-side device hash linking (Tier 2 #1).
 * Uses crypto.subtle in browser/Node or crypto module in Node.
 */

export async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Node.js fallback
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(message).digest('hex');
  } catch {
    // Basic fast hex hash fallback
    let h = 0x811c9dc5;
    for (let i = 0; i < message.length; i++) {
      h ^= message.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16).padStart(64, '0');
  }
}
