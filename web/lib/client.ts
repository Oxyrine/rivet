import createClient from 'openapi-fetch';
import type { paths } from './api-schema';
import { getSession, accessToken } from './api';

export const apiClient = createClient<paths>({
  baseUrl: '/api',
});

apiClient.use({
  async onRequest({ request }) {
    const token = await accessToken(getSession());
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    if (!['GET', 'HEAD'].includes(request.method.toUpperCase()) && !request.headers.has('Idempotency-Key')) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        request.headers.set('Idempotency-Key', crypto.randomUUID());
      }
    }
    return request;
  },
});

export default apiClient;
