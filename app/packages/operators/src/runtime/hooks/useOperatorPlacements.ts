import { useRecoilValue } from "recoil";
import { placementsForPlaceSelector } from "../recoil";
import { Places } from "../../types";

type OperatorPlacement = {
  placement: {
    place: Places;
  };
  operator: {
    config: {
      canExecute: boolean;
    };
  };
};

type UseOperatorPlacementsReturn = {
  placements: OperatorPlacement[];
};

/**
 * useOperatorPlacements
 *
 * A hook to retrieve operator placements for a given place.
 *
 * @param place - The place to filter operator placements by.
 * @returns {UseOperatorPlacementsReturn} - An object containing the filtered operator placements.
 */
export default function useOperatorPlacements(
  place: Places
): UseOperatorPlacementsReturn {
  const placements = useRecoilValue(placementsForPlaceSelector(place));

  return { placements };
}
