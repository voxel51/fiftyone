import { getFetchFunction } from "@fiftyone/utilities";
import type {
  FetchMultimodalBootstrapWindowParams,
  FetchMultimodalBufferParams,
  FetchMultimodalTimelineParams,
  FetchMultimodalWorkspaceParams,
  MultimodalBootstrapWindowRequest,
  MultimodalRawBufferResponse,
  MultimodalRawBufferTransportResponse,
  MultimodalRenderingPlan,
  MultimodalTimelineIndexRequest,
  MultimodalTimelineIndexResponse,
  MultimodalWorkspaceResponse,
  SaveMultimodalWorkspaceParams,
  MultimodalStreamWindowRequest,
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

export function normalizeMultimodalRawBufferResponse(
  response: MultimodalRawBufferTransportResponse
): MultimodalRawBufferResponse {
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

export async function fetchMultimodalWorkspace(
  params: FetchMultimodalWorkspaceParams
): Promise<MultimodalWorkspaceResponse> {
  const fetch = getFetchFunction({ cache: true });
  const query = new URLSearchParams({
    mediaField: params.mediaField,
  });

  if (params.sourceKind) {
    query.set("sourceKind", params.sourceKind);
  }

  return fetch<void, MultimodalWorkspaceResponse>(
    "GET",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(
      params.sampleId
    )}/multimodal/workspace?${query.toString()}`
  );
}

export async function saveMultimodalWorkspace(
  params: SaveMultimodalWorkspaceParams
): Promise<MultimodalRenderingPlan> {
  const fetch = getFetchFunction();

  return fetch<MultimodalRenderingPlan, MultimodalRenderingPlan>(
    "PATCH",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(params.sampleId)}/multimodal/workspace`,
    params.renderingPlan
  );
}

export async function fetchMultimodalBuffer(
  params: FetchMultimodalBufferParams
): Promise<MultimodalRawBufferResponse> {
  const fetch = getFetchFunction();
  const response = await fetch<
    MultimodalStreamWindowRequest,
    MultimodalRawBufferTransportResponse
  >(
    "POST",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(params.sampleId)}/multimodal/stream-window`,
    {
      ...params.request,
      mode: "raw",
    }
  );

  return normalizeMultimodalRawBufferResponse(response);
}

export async function fetchMultimodalBootstrapWindow(
  params: FetchMultimodalBootstrapWindowParams
): Promise<MultimodalRawBufferResponse> {
  const fetch = getFetchFunction();
  const response = await fetch<
    MultimodalBootstrapWindowRequest,
    MultimodalRawBufferTransportResponse
  >(
    "POST",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(
      params.sampleId
    )}/multimodal/bootstrap-window`,
    params.request
  );

  return normalizeMultimodalRawBufferResponse(response);
}

export async function fetchMultimodalTimeline(
  params: FetchMultimodalTimelineParams
): Promise<MultimodalTimelineIndexResponse> {
  const fetch = getFetchFunction({ cache: true });

  return fetch<MultimodalTimelineIndexRequest, MultimodalTimelineIndexResponse>(
    "POST",
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(params.sampleId)}/multimodal/timeline-index`,
    params.request
  );
}
