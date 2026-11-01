// Idempotency identifiers must also work on an HTTP local-network origin.
// These identifiers are not authentication/session credentials.
export function muralClientKey():string {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
