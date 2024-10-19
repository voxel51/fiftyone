import { getFetchFunction } from "@fiftyone/utilities";
import * as types from "../../types";
import ExecutionContext from "./ExecutionContext";
import { formatSelectedLabels } from "./utils";
import getLocalOrRemoteOperator from "./getLocalOrRemoteOperator";
import { resolveOperatorURI } from "./resolveOperator";
import Operator from "./Operator";

// Payload type for fetching remote placements
interface RemotePlacementPayload {
  dataset_name: string;
  extended: boolean;
  extended_selection: { selection: string[] | null; scope: string };
  view: string;
  filters: object;
  selected: string[];
  selected_labels: object[];
  current_sample: string;
  view_name: string;
  group_slice: string;
}

// Response type for the fetch request
interface FetchRemotePlacementsResponse {
  placements: RemotePlacementJSON[];
  error?: string;
}

// Type for individual placement response object
interface RemotePlacementJSON {
  operator_uri: string;
  placement: {
    place: string;
    view: object;
  };
}

/**
 * Fetches remote placements for operators within the given execution context.
 *
 * @param ctx - The execution context.
 * @returns A Promise that resolves to an array of remote placements, each containing an operator, placement, and isRemote flag.
 */
export default async function fetchRemotePlacements(
  ctx: ExecutionContext
): Promise<
  {
    operator: Operator | undefined;
    placement: types.Placement;
    isRemote: boolean;
  }[]
> {
  const payload = createPayload(ctx);

  const result: FetchRemotePlacementsResponse = await getFetchFunction()(
    "POST",
    "/operators/resolve-placements",
    payload
  );

  if (result.error) {
    throw new Error(`Failed to fetch remote placements: ${result.error}`);
  }

  return transformPlacements(result.placements);
}

/**
 * Creates the payload for fetching remote placements.
 *
 * @param ctx - The execution context.
 * @returns The formatted payload.
 */
function createPayload(ctx: ExecutionContext): RemotePlacementPayload {
  const currentContext = ctx._currentContext;

  return {
    dataset_name: currentContext.datasetName,
    extended: currentContext.extended,
    extended_selection: currentContext.extendedSelection,
    view: currentContext.view,
    filters: currentContext.filters,
    selected: currentContext.selectedSamples
      ? Array.from(currentContext.selectedSamples)
      : [],
    selected_labels: formatSelectedLabels(currentContext.selectedLabels),
    current_sample: currentContext.currentSample,
    view_name: currentContext.viewName,
    group_slice: currentContext.groupSlice,
  };
}

/**
 * Transforms the raw placement data into a structured format.
 *
 * @param placementsAsJSON - Array of placement JSON objects.
 * @returns An array of transformed placements.
 */
function transformPlacements(placementsAsJSON: RemotePlacementJSON[]): {
  operator: Operator | undefined;
  placement: types.Placement;
  isRemote: boolean;
}[] {
  return placementsAsJSON.map((p: RemotePlacementJSON) => {
    const { operator, isRemote } = getLocalOrRemoteOperator(
      resolveOperatorURI(p.operator_uri)
    );

    return {
      operator,
      placement: types.Placement.fromJSON(p.placement),
      isRemote,
    };
  });
}
