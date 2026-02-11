import type {
  TransportDeleteOptions,
  TransportPostOptions,
  UploadTransport,
} from "./types";

// ── Error parsing (shared) ─────────────────────────────────────────────

async function parseUploadError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(
      data.error?.message ?? `Upload failed with status ${response.status}`
    );
  } catch {
    return new Error(`Upload failed with status ${response.status}`);
  }
}

// ── Fetch-based transport (default) ────────────────────────────────────

async function fetchPost(
  url: string,
  file: File,
  options: TransportPostOptions
): Promise<{ path: string }> {
  const init: RequestInit = {
    method: "POST",
    body: file,
    signal: options.signal,
  };
  if (options.headers) init.headers = options.headers;
  const response = await fetch(url, init);
  if (response.status === 201) {
    const result = await response.json();
    options.onProgress?.(100);
    return result;
  }
  throw await parseUploadError(response);
}

async function fetchDelete(
  url: string,
  options?: TransportDeleteOptions
): Promise<void> {
  const init: RequestInit = { method: "DELETE" };
  if (options?.headers) init.headers = options.headers;
  await fetch(url, init);
}

export function createFetchTransport(): UploadTransport {
  return { post: fetchPost, delete: fetchDelete };
}

// ── XHR-based transport (real progress) ────────────────────────────────

function xhrPost(
  url: string,
  file: File,
  options: TransportPostOptions
): Promise<{ path: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options.signal) {
      options.signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        options.onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(
            new Error(
              data.error?.message ?? `Upload failed with status ${xhr.status}`
            )
          );
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    xhr.open("POST", url);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.send(file);
  });
}

export function createXhrTransport(): UploadTransport {
  return { post: xhrPost, delete: fetchDelete };
}

// ── Standalone helpers (backward compat) ───────────────────────────────

const defaultTransport = createFetchTransport();

export async function postFile(
  url: string,
  file: File,
  signal?: AbortSignal
): Promise<{ path: string }> {
  return defaultTransport.post(url, file, { signal });
}

export async function deleteRemoteFile(url: string): Promise<void> {
  return defaultTransport.delete(url);
}
