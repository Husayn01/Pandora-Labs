export class ApiResponseError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
  }
}

type ErrorPayload = { error?: unknown; message?: unknown };

function errorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = payload as ErrorPayload;
    if (typeof value.error === 'string' && value.error.trim()) return value.error;
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
  }
  return status ? `The server could not complete the request (HTTP ${status}).` : 'The server could not complete the request.';
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const raw = await response.text();
    let payload: unknown = {};

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new ApiResponseError(
          response.ok
            ? 'The server returned an invalid response.'
            : `The server returned a non-JSON error (HTTP ${response.status}).`,
          response.status,
        );
      }
    }

    if (!response.ok) throw new ApiResponseError(errorMessage(payload, response.status), response.status);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiResponseError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiResponseError(
        init.signal?.aborted ? 'The request was cancelled.' : 'The request timed out. Please try again.',
        504,
      );
    }
    throw new ApiResponseError('The server could not be reached. Check your connection and try again.');
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
