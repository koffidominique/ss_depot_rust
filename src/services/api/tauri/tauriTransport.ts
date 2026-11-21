import { ApiError } from "../ApiClient.ts";

/* ============================================================================
 * Transport IPC Tauri (gestion du token de session et appels invoke)
 * ============================================================================ */

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

const TAURI_TOKEN_KEY = "depotpro_tauri_token";

export function getStoredTauriToken(): string {
  return sessionStorage.getItem(TAURI_TOKEN_KEY) || "";
}

export function setStoredTauriToken(token: string): void {
  sessionStorage.setItem(TAURI_TOKEN_KEY, token);
}

export function clearStoredTauriToken(): void {
  sessionStorage.removeItem(TAURI_TOKEN_KEY);
}

export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const internals = (
    window as unknown as { __TAURI_INTERNALS__?: TauriInternals }
  ).__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new ApiError(
      "TAURI_UNAVAILABLE",
      "Le runtime desktop Tauri n’est pas disponible.",
    );
  }
  try {
    return await internals.invoke<T>(cmd, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError("TAURI_COMMAND_ERROR", message);
  }
}
