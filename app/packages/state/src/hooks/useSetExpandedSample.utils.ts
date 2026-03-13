import { is3d } from "@fiftyone/utilities";

type GroupMediaType = { name: string; mediaType: string };

export type ResolveModalGroupSliceParams = {
  groupSlice: string | null;
  currentModalSlice: string | null;
  groupMediaTypes: GroupMediaType[];
  groupMediaTypesMap: Record<string, string>;
  hasExistingModal: boolean;
  is3dPinned: boolean;
  destinationHasCurrentModalSlice: boolean | null;
};

const getFirstNon3dSlice = (groupMediaTypes: GroupMediaType[]) =>
  groupMediaTypes
    .filter(({ mediaType }) => !is3d(mediaType))
    .map(({ name }) => name)
    .sort()[0] ?? null;

/**
 * Resolves the slice that modal navigation should use for the destination sample.
 *
 * Precedence:
 * 1. Start from the grid slice (`groupSlice`) as the baseline.
 * 2. Preserve `currentModalSlice` only for existing modal-to-modal navigation,
 *    and only when the destination group confirms that slice exists.
 * 3. If baseline is 3D and we cannot preserve:
 *    - fresh modal open OR unpinned: move to deterministic first non-3D slice
 *    - pinned existing modal: stay on baseline 3D slice
 * 4. If baseline is non-3D, keep baseline.
 */
export const resolveModalGroupSlice = ({
  groupSlice,
  currentModalSlice,
  groupMediaTypes,
  groupMediaTypesMap,
  hasExistingModal,
  is3dPinned,
  destinationHasCurrentModalSlice,
}: ResolveModalGroupSliceParams): string | null => {
  if (!groupSlice) {
    return currentModalSlice;
  }

  const currentModalSliceIsKnown = Boolean(
    currentModalSlice &&
      groupMediaTypes.some(({ name }) => name === currentModalSlice)
  );
  const currentMatchesBaseline = currentModalSlice === groupSlice;
  const destinationConfirmsCurrent =
    currentMatchesBaseline || destinationHasCurrentModalSlice === true;

  const canPreserveCurrentModalSlice = Boolean(
    hasExistingModal &&
      currentModalSlice &&
      currentModalSliceIsKnown &&
      destinationConfirmsCurrent
  );

  if (canPreserveCurrentModalSlice) {
    return currentModalSlice;
  }

  if (!is3d(groupMediaTypesMap[groupSlice])) {
    return groupSlice;
  }

  if (!is3dPinned || !hasExistingModal) {
    return getFirstNon3dSlice(groupMediaTypes) ?? groupSlice;
  }

  return groupSlice;
};
