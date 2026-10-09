/** The storm covers only the first load; after that the grid stays on screen. */
export const showStorm = ({ everLoaded }: { everLoaded: boolean }) =>
  !everLoaded;

/**
 * Whether the panel's pending bar shows: a later rebuild that really fetches.
 * A resize's interim builds read from memory and never show it.
 */
export const showPending = ({
  building,
  everLoaded,
  fetching,
  interim,
}: {
  building: boolean;
  everLoaded: boolean;
  fetching: boolean;
  interim: boolean;
}) => everLoaded && building && fetching && !interim;
