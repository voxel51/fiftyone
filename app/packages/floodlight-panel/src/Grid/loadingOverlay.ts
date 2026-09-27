/**
 * Whether the loading overlay covers the grid: until the first instance
 * loads, while a rebuild really fetches (never for a resize's interim
 * builds), and while scrubbing.
 */
export const showStorm = ({
  building,
  everLoaded,
  fetching,
  interim,
  scrubbing,
}: {
  building: boolean;
  everLoaded: boolean;
  fetching: boolean;
  interim: boolean;
  scrubbing: boolean;
}) => !everLoaded || (building && fetching && !interim) || scrubbing;
