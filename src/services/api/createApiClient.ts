import type { ApiClient } from './ApiClient.ts';
import { HttpApiClient } from './HttpApiClient.ts';
import { TauriApiClient } from './TauriApiClient.ts';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function createApiClient(): ApiClient {
  if (isTauriRuntime()) {
    return new TauriApiClient();
  }
  return new HttpApiClient();
}

export const apiClient = createApiClient();
