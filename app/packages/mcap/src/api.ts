import {
  getFetchFunction,
  getFetchFunctionExtended,
} from "@fiftyone/utilities";
import { decodeRawBufferBatchInWorker } from "./raw-buffer-batch-worker-client";
import {
  materializeRawBufferResponse,
  MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE,
  MultimodalBinaryTransportUnsupportedError,
  parseEncodedWindowBatch,
} from "./raw-buffer-binary";
import type {
  FetchMultimodalBootstrapWindowParams,
  FetchMultimodalBufferParams,
  FetchMultimodalTimelineParams,
  FetchMultimodalWorkspaceParams,
  MultimodalRawBufferResponse,
  MultimodalRenderingPlan,
  MultimodalTimelineIndexRequest,
  MultimodalTimelineIndexResponse,
  MultimodalWorkspaceResponse,
  SaveMultimodalWorkspaceParams,
} from "./types";

async function fetchBinaryRawBuffer<A>(
  path: string,
  body: A
): Promise<MultimodalRawBufferResponse> {
  const fetch = getFetchFunctionExtended();
  const { headers, response } = await fetch<A, ArrayBuffer>({
    method: "POST",
    path,
    body,
    result: "arrayBuffer",
  });
  const contentType = headers?.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes(MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE)) {
    throw new MultimodalBinaryTransportUnsupportedError(
      `Unexpected binary raw buffer content type: ${contentType || "missing"}`
    );
  }

  const encodedBatch = parseEncodedWindowBatch(response);
  const { payloadBuffer, ...batchWithoutPayload } = encodedBatch;
  const decodedBatch = await decodeRawBufferBatchInWorker({
    batch: batchWithoutPayload,
    payloadBuffer,
  });

  return materializeRawBufferResponse(batchWithoutPayload, decodedBatch);
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
  return fetchBinaryRawBuffer(
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(
      params.sampleId
    )}/multimodal/stream-window-binary`,
    {
      ...params.request,
      mode: "raw",
    }
  );
}

export async function fetchMultimodalBootstrapWindow(
  params: FetchMultimodalBootstrapWindowParams
): Promise<MultimodalRawBufferResponse> {
  return fetchBinaryRawBuffer(
    `/dataset/${encodeURIComponent(
      params.datasetId
    )}/sample/${encodeURIComponent(
      params.sampleId
    )}/multimodal/bootstrap-window-binary`,
    params.request
  );
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
