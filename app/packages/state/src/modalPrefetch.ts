/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { mainSample, type mainSampleQuery } from "@fiftyone/relay";
import {
  createOperationDescriptor,
  fetchQuery,
  getRequest,
  type Disposable,
  type IEnvironment,
  type VariablesOf,
} from "relay-runtime";
import { getSampleSrc } from "./recoil/utils";
import { getNormalizedUrls } from "./utils";

/** A warmed modal sample. `release` undoes everything the warm did. */
export type WarmedModalSample = { release: () => void };

/**
 * Resolves the media URL the modal looker requests for a sample, or `null`.
 * Only image samples resolve: video and 3D media need their own warming.
 */
export function resolveModalMediaSrc(
  response: mainSampleQuery["response"],
  mediaField: string,
): string | null {
  const sample = response?.sample;
  if (
    !sample ||
    sample.__typename !== "ImageSample" ||
    !("urls" in sample) ||
    !sample.urls
  ) {
    return null;
  }

  const normalized = getNormalizedUrls(sample.urls);
  const path = normalized[mediaField] ?? normalized.filepath;
  return path ? getSampleSrc(path) : null;
}

/**
 * Pins a modal sample's query result in the Relay store without fetching
 * it. The App's store runs with `gcReleaseBufferSize: 0`, so a result that
 * nothing retains is collected as soon as its last reader lets go.
 *
 * `variables` must come from `buildModalSampleVariables`, or the record
 * this retains is not the one the modal reads.
 */
export const retainModalSample = (
  environment: IEnvironment,
  variables: VariablesOf<mainSampleQuery>,
): Disposable =>
  environment.retain(
    createOperationDescriptor(getRequest(mainSample), variables),
  );

/**
 * Warms a sample the modal may open next. It fetches the sample into the
 * Relay store and retains it, and for an image sample it loads the media
 * into a held `<img>`. Opening the sample is then a store hit, and the
 * looker requests a URL the browser already holds.
 *
 * The image URL comes from this fetch's response, which the modal later
 * reads from the store. Signed cloud URLs change with every response, so a
 * URL from any other request would never match the looker's.
 *
 * `variables` must come from `buildModalSampleVariables`, or the modal's
 * read misses the warmed record.
 */
export const warmModalSample = (
  environment: IEnvironment,
  variables: VariablesOf<mainSampleQuery>,
  mediaField: string,
): WarmedModalSample => {
  const retained = retainModalSample(environment, variables);
  // Held until release, so the browser keeps the image for the navigation
  // it was warmed for.
  let image: HTMLImageElement | null = null;

  const subscription = fetchQuery<mainSampleQuery>(
    environment,
    mainSample,
    variables,
    { fetchPolicy: "store-or-network" },
  ).subscribe({
    next: (data) => {
      const src = resolveModalMediaSrc(data, mediaField);
      if (src && !image) {
        image = new Image();
        image.decoding = "async";
        image.src = src;
      }
    },
    error: (error: Error) => {
      console.warn("Failed to warm modal sample", error);
    },
  });

  return {
    release: () => {
      subscription.unsubscribe();
      retained.dispose();
      if (image) {
        // Dropping the src lets the browser free the image.
        image.src = "";
        image = null;
      }
    },
  };
};
