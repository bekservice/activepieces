import {
  AppConnectionValueForAuthProperty,
  createTrigger,
  Property,
  StaticPropsValue,
  TriggerStrategy,
} from '@activepieces/pieces-framework';
import { DedupeStrategy, Polling, pollingHelper, HttpMethod } from '@activepieces/pieces-common';
import dayjs from 'dayjs';
import { famulorAuth } from '../common/auth';
import { famulorRequest, flattenAssistant, unwrapList } from '../common/client';

const props = {
  limit: Property.Number({
    displayName: 'Page size',
    description: 'Assistants fetched per API page while polling (1–200, default 100)',
    required: false,
    defaultValue: 100,
  }),
};

const polling: Polling<
  AppConnectionValueForAuthProperty<typeof famulorAuth>,
  StaticPropsValue<typeof props>
> = {
  strategy: DedupeStrategy.TIMEBASED,
  items: async ({ auth, propsValue }) => {
    const pageSize = Math.min(Math.max(propsValue.limit ?? 100, 1), 200);
    const allAssistants: Record<string, unknown>[] = [];
    let offset = 0;
    const maxPages = 50;

    for (let page = 0; page < maxPages; page++) {
      const body = await famulorRequest({
        auth,
        method: HttpMethod.GET,
        path: '/assistants',
        queryParams: {
          limit: String(pageSize),
          offset: String(offset),
        },
      });
      const batch = unwrapList(body, ['assistants', 'data', 'rows']);
      if (batch.length === 0) {
        break;
      }
      allAssistants.push(...batch);
      if (batch.length < pageSize) {
        break;
      }
      offset += pageSize;
    }

    return allAssistants.flatMap((assistant) => {
      const epochMilliSeconds = parseAssistantEpoch(assistant);
      if (epochMilliSeconds === null) {
        return [];
      }
      return [
        {
          epochMilliSeconds,
          data: flattenAssistant(assistant),
        },
      ];
    });
  },
};

export const getAssistants = createTrigger({
  auth: famulorAuth,
  name: 'getAssistants',
  displayName: 'New or Updated Assistant',
  description: 'Triggers when AI assistants are created or updated in your Famulor workspace.',
  classification: 'READ',
  aiMetadata: {
    description:
      'Polling trigger for newly created or updated Famulor assistants (UUIDs). Use when a flow should start from assistant changes rather than listing them on demand.',
  },
  props,
  sampleData: {
    id: '6f3e8862-9f54-48a2-bc83-9093cc7e27f7',
    name: 'Customer Support Assistant',
    is_active: true,
    mode: 'pipeline',
    primary_language: 'de',
    timezone: 'Europe/Berlin',
    first_message: 'Hello, how can I help you today?',
    tags: 'support',
    created_at: '2026-01-15T10:30:00Z',
    updated_at: '2026-01-15T14:20:00Z',
  },
  type: TriggerStrategy.POLLING,
  async test(context) {
    return await pollingHelper.test(polling, context);
  },
  async onEnable(context) {
    await pollingHelper.onEnable(polling, context);
  },
  async onDisable(context) {
    await pollingHelper.onDisable(polling, context);
  },
  async run(context) {
    return await pollingHelper.poll(polling, context);
  },
});

function parseAssistantEpoch(assistant: Record<string, unknown>): number | null {
  const candidates = [assistant['updated_at'], assistant['created_at']];
  for (const candidate of candidates) {
    const epoch = parseStableEpoch(candidate);
    if (epoch !== null) {
      return epoch;
    }
  }
  return null;
}

function parseStableEpoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = dayjs(trimmed);
  if (!parsed.isValid()) {
    return null;
  }
  const epoch = parsed.valueOf();
  if (!Number.isFinite(epoch) || epoch <= 0) {
    return null;
  }
  return epoch;
}
