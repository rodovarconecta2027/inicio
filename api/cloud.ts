import type { Request, Response } from 'express';
import { createCloudApi } from '../src/server/cloud/api.js';
import { cloudRuntime } from '../src/server/cloud/runtime.js';

let handler: ReturnType<typeof createCloudApi>;
export default function cloudApi(req: Request, res: Response) {
  try {
    const path = req.query.cloudPath;
    if (typeof path === 'string' && /^[A-Za-z0-9_/-]*$/.test(path)) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key === 'cloudPath') continue;
        for (const item of Array.isArray(value) ? value : [value]) if (typeof item === 'string') query.append(key, item);
      }
      req.url = '/api/cloud/' + path + (query.size ? '?' + query.toString() : '');
    }
    handler ||= createCloudApi(cloudRuntime());
    return handler(req, res);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'A integração de homologação ainda não foi configurada.', code: 'CLOUD_CONFIGURATION_REQUIRED' });
  }
}
