import { newRequestKey } from './requestKey';

export const CLOUD_MODE = (import.meta as any).env?.VITE_CLOUD_AUTH === 'true';
/** Only the homologation build uses the remote API. External URLs are untouched. */
export async function portalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let target = input;
  if (CLOUD_MODE && typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/cloud/')) {
    target = input.replace('/api/', '/api/cloud/');
  }
  const options = { ...init };
  if (CLOUD_MODE && typeof target === 'string' && target.startsWith('/api/cloud/')) {
    const headers = new Headers(init?.headers);
    if (!['GET', 'HEAD'].includes((init?.method || 'GET').toUpperCase()) && !headers.has('X-Idempotency-Key')) {
      headers.set('X-Idempotency-Key', newRequestKey());
    }
    options.headers = headers;
  }
  try {
    const response = await globalThis.fetch(target, options);
    if (CLOUD_MODE && typeof target === 'string' && target.startsWith('/api/cloud/') && !target.includes('/auth/')) {
      const resource = target.split('?')[0];
      window.dispatchEvent(new CustomEvent('rodovar:api-status', { detail: { resource, ok: response.ok, status: response.status } }));
    }
    return response;
  } catch (error) {
    if (CLOUD_MODE && !(error instanceof DOMException && error.name === 'AbortError')) window.dispatchEvent(new CustomEvent('rodovar:api-status', { detail: { resource: String(target).split('?')[0], ok: false, status: 0 } }));
    throw error;
  }
}
