import { createClient } from '@supabase/supabase-js';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const proxyUrl = process.env.GLOBAL_AGENT_HTTP_PROXY;

const customFetch = proxyUrl
  ? (input: string | URL | Request, init?: RequestInit) => {
      const dispatcher = new ProxyAgent(proxyUrl);
      return undiciFetch(input as string, {
        ...(init as Record<string, unknown>),
        dispatcher,
      }) as unknown as Promise<Response>;
    }
  : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    ...(customFetch ? { fetch: customFetch } : {}),
  },
});
