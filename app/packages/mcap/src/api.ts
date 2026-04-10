import { getFetchFunction } from "@fiftyone/utilities";
import type {
  FetchMcapBufferParams,
  FetchMcapSceneParams,
  McapBufferRequest,
  McapRawBufferResponse,
  McapRawBufferTransportResponse,
  McapSceneOpenResponse,
} from "./types";

function decodeBase64ToBytes(value: string) {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }

  if (typeof globalThis.atob !== "function") {
    throw new Error("No base64 decoder is available in this environment");
  }

  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/** Normalizes the raw MCAP buffer response into transferable browser buffers. */
export function normalizeMcapRawBufferResponse(
  response: McapRawBufferTransportResponse
): McapRawBufferResponse {
  return {
    ...response,
    streams: response.streams.map((stream) => ({
      ...stream,
      messages: stream.messages.map(({ payloadB64, ...message }) => ({
        ...message,
        payload: decodeBase64ToBytes(payloadB64),
      })),
    })),
  };
}

/** Fetches the cached scene-open payload for a sample-backed MCAP file. */
export async function fetchMcapScene(
  params: FetchMcapSceneParams
): Promise<McapSceneOpenResponse> {
  const fetch = getFetchFunction({ cache: true });

  return fetch<void, McapSceneOpenResponse>(
    "GET",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(
      params.sampleId
    )}/mcap/scene?media_field=${encodeURIComponent(params.mediaField)}`
  );
}

/** Fetches a raw MCAP message window and decodes payload bytes for workers. */
export async function fetchMcapBuffer(
  params: FetchMcapBufferParams
): Promise<McapRawBufferResponse> {
  const fetch = getFetchFunction();
  const response = await fetch<
    McapBufferRequest,
    McapRawBufferTransportResponse
  >(
    "POST",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(params.sampleId)}/mcap/buffer`,
    {
      ...params.request,
      mode: params.request.mode ?? "raw",
    }
  );

  return normalizeMcapRawBufferResponse(response);
}
