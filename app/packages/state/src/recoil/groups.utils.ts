import { ModalSample } from "./modal";

type SliceToSampleMap = Record<string, ModalSample>;

/**
 * Resolves the effective media path for a grouped sample and media field.
 */
export const getGroupSampleMediaPath = (
  sample: ModalSample,
  mediaField: string
) => {
  if (Array.isArray(sample?.urls)) {
    const mediaFieldUrl = sample.urls.find((url) => url.field === mediaField);
    return mediaFieldUrl?.url ?? sample.urls[0]?.url ?? sample.sample.filepath;
  }

  return sample?.urls?.[mediaField] ?? sample?.sample?.filepath;
};

/**
 * Picks the slice that should represent the active grouped 3D selection.
 */
export const getRepresentative3dSlice = ({
  activeSlices = [],
  sampleMap = {},
  pinnedSlice,
}: {
  activeSlices?: string[];
  sampleMap?: SliceToSampleMap;
  pinnedSlice: string | null;
}) => {
  const pinnedRepresentativeSlice =
    pinnedSlice && sampleMap[pinnedSlice] ? pinnedSlice : null;
  const activeRepresentativeSlice = activeSlices.find((slice) =>
    Boolean(sampleMap[slice])
  );

  return (
    pinnedRepresentativeSlice ||
    activeRepresentativeSlice ||
    Object.keys(sampleMap)[0] ||
    null
  );
};

/**
 * Resolves the grouped 3D sample map, representative slice, and representative sample
 * used by sample-scoped 3D interactions.
 */
export const resolveInteraction3dState = ({
  isGroup,
  modalSample,
  activeSlices = [],
  activeSampleMap = {},
  allSampleMap = {},
  pinnedSlice,
}: {
  isGroup: boolean;
  modalSample: ModalSample;
  activeSlices?: string[];
  activeSampleMap?: SliceToSampleMap;
  allSampleMap?: SliceToSampleMap;
  pinnedSlice: string | null;
}) => {
  const sampleMap = isGroup
    ? activeSlices.length
      ? activeSampleMap
      : allSampleMap
    : { default: modalSample };
  const representativeSlice = isGroup
    ? getRepresentative3dSlice({
        activeSlices,
        sampleMap,
        pinnedSlice,
      })
    : null;

  return {
    sampleMap,
    representativeSlice,
    representativeSample: representativeSlice
      ? sampleMap[representativeSlice] ?? modalSample
      : modalSample,
  };
};

/**
 * Compares 3D slice arrays by content and order.
 */
export const areSlicesEqual = (current: string[], next: string[]) => {
  return (
    current.length === next.length &&
    current.every((slice, index) => slice === next[index])
  );
};

/**
 * Normalizes active 3D slice order while enforcing a single active real FO3D slice.
 */
export const normalizeActive3dSlices = ({
  activeSlices,
  preferredFo3dSlice = null,
  realFo3dSlices,
}: {
  activeSlices: string[];
  preferredFo3dSlice?: string | null;
  realFo3dSlices: string[];
}) => {
  const uniqueSlices = Array.from(new Set(activeSlices));
  const fo3dSliceSet = new Set(realFo3dSlices);

  if (!fo3dSliceSet.size) {
    return uniqueSlices;
  }

  const canUsePreferredFo3dSlice =
    preferredFo3dSlice !== null &&
    fo3dSliceSet.has(preferredFo3dSlice) &&
    uniqueSlices.includes(preferredFo3dSlice);
  const activeFo3dSlice = canUsePreferredFo3dSlice
    ? preferredFo3dSlice
    : uniqueSlices.find((slice) => fo3dSliceSet.has(slice)) ?? null;

  if (!activeFo3dSlice) {
    return uniqueSlices;
  }

  return uniqueSlices.filter(
    (slice) => !fo3dSliceSet.has(slice) || slice === activeFo3dSlice
  );
};

/**
 * Chooses the pinned 3D slice that should back grouped 3D interactions.
 */
export const resolvePinned3dSlice = ({
  active3dSlices,
  all3dSlices,
  pinnedSlice,
  samples,
}: {
  active3dSlices: string[];
  all3dSlices: string[];
  pinnedSlice: string | null;
  samples: SliceToSampleMap;
}) => {
  const validActiveSlices = active3dSlices.filter((slice) =>
    Boolean(samples[slice])
  );

  if (pinnedSlice && validActiveSlices.includes(pinnedSlice)) {
    return pinnedSlice;
  }

  if (validActiveSlices.length) {
    return validActiveSlices[0];
  }

  if (pinnedSlice && samples[pinnedSlice]) {
    return pinnedSlice;
  }

  return all3dSlices.find((slice) => Boolean(samples[slice])) ?? null;
};

/**
 * Resolves the normalized grouped 3D selection after slice availability changes.
 */
export const resolveNormalized3dSelection = ({
  active3dSlices,
  all3dSlices,
  pinnedSlice,
  preferredFo3dSlice = null,
  realFo3dSlices,
  samples,
}: {
  active3dSlices: string[];
  all3dSlices: string[];
  pinnedSlice: string | null;
  preferredFo3dSlice?: string | null;
  realFo3dSlices: string[];
  samples: SliceToSampleMap;
}) => {
  const validAll3dSlices = all3dSlices.filter((slice) =>
    Boolean(samples[slice])
  );
  const validActive3dSlices = active3dSlices.filter((slice) =>
    Boolean(samples[slice])
  );
  const nextPinnedSlice = resolvePinned3dSlice({
    active3dSlices: validActive3dSlices,
    all3dSlices: validAll3dSlices,
    pinnedSlice,
    samples,
  });
  const nextActive3dSlices = normalizeActive3dSlices({
    activeSlices: nextPinnedSlice
      ? [
          nextPinnedSlice,
          ...validActive3dSlices.filter((slice) => slice !== nextPinnedSlice),
        ]
      : validActive3dSlices,
    preferredFo3dSlice: preferredFo3dSlice ?? nextPinnedSlice,
    realFo3dSlices,
  });

  return {
    nextActive3dSlices,
    nextPinnedSlice,
  };
};
