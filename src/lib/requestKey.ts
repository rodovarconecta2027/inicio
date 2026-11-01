// These are retry identifiers, not authentication credentials. getRandomValues
// also works on local HTTP IP addresses where randomUUID is unavailable.
export function newRequestKey(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
