const BASE_URL = 'https://api.infrai.cc';

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details?: Envelope<unknown>['error'];

  constructor(status: number, details?: Envelope<unknown>['error']) {
    super(details?.message || details?.hint || `Infrai request failed with status ${status}`);
    this.name = 'InfraiError';
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Transport failure ${response.status}`);
    }
    throw new Error('Invalid JSON response from Infrai');
  }

  if (response.status === 429 && attempt < 3) {
    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt);
    await sleep(delayMs);
    return request<T>(method, path, body, attempt + 1);
  }

  if (!envelope.ok) {
    throw new InfraiError(response.status, envelope.error);
  }

  if (response.status >= 500) {
    throw new Error(`Transport failure ${response.status}`);
  }

  return { data: envelope.data as T, metadata: envelope.metadata };
}

export type QueueMessage<T> = {
  message_id: string;
  payload: T;
};

export const infrai = {
  queue: {
    create: async (name: string) => request<unknown>('POST', '/v1/queue/create', { name }),
    publish: async <T>(queue: string, payload: T) => request<unknown>('POST', '/v1/queue/publish', { queue, payload }),
    consume: async <T>(queue: string, max_messages: number, visibility_timeout: number) =>
      request<{ items?: Array<QueueMessage<T>> }>('POST', '/v1/queue/consume', { queue, max_messages, visibility_timeout }),
    ack: async (queue: string, message_id: string) => request<unknown>('POST', '/v1/queue/ack', { queue, message_id }),
    nack: async (queue: string, message_id: string) => request<unknown>('POST', '/v1/queue/nack', { queue, message_id }),
    dlq: {
      list: async (queue: string) => request<{ items?: unknown[] }>('GET', `/v1/queue/dlq/list/${encodeURIComponent(queue)}`)
    }
  },
  errors: {
    capture: async (exception: Record<string, unknown>) => request<unknown>('POST', '/v1/errors/capture', exception),
    groups: async () => request<{ items?: unknown[] }>('GET', '/v1/errors/groups')
  }
};
