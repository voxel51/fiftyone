import { encodeURIPath } from "./util";

/**
 * Label types which currently support mutation via {@link patchSample}.
 */
type MutableLabelTypes =
  | "Classification"
  | "Classifications"
  | "Detection"
  | "Detections"
  | "Polyline"
  | "Polylines";

/**
 * A field specification can either be
 *  - `null` indicating the field should be deleted, OR
 *  - an object containing at least the `_cls` field to specify the label type
 */
type FieldSpecification =
  | null
  | ({ _cls: MutableLabelTypes } & Record<string, never>);

export type PatchSampleRequest = {
  datasetId: string;
  sampleId: string;
  deltas: Record<string, FieldSpecification>[];
};

export type PatchSampleResponse = {
  status: string;
  patched_sample_id: string;
  errors: string[];
};

/**
 * Patch a sample, applying the specified updates to its fields.
 *
 * @param request Patch sample request
 */
export const patchSample = async (
  request: PatchSampleRequest
): Promise<PatchSampleResponse> => {
  const httpResponse = await fetch(
    encodeURIPath(["dataset", request.datasetId, "sample", request.sampleId]),
    {
      method: "PATCH",
      body: JSON.stringify(request.deltas),
      headers: {
        "content-type": "application/json",
      },
    }
  );

  if (httpResponse.ok) {
    return httpResponse.json();
  } else {
    throw new Error(`http error: ${httpResponse.status}`);
  }
};
