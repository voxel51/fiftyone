// import { searchInputState } from '@fiftyone/teams-state';
import { useMemo } from "react";

export default function useSearchAdornment(
  prefixes: string[],
  searchInput: string
) {
  let typeAdornment = "";

  if (searchInput) {
    // Find the first prefix that matches the condition
    const foundPrefix = prefixes.find((prefix) => searchInput.includes(prefix));
    // If a prefix is found, strip the colon to get the type
    if (foundPrefix) {
      typeAdornment = foundPrefix.replace(":", "");
    }
  }
  const containsPrefix = prefixes.some((prefix) =>
    searchInput.includes(prefix)
  );

  // This is the display part of the input after the adornment in UI
  const displayWithoutAdornment = useMemo(() => {
    if (containsPrefix) {
      return searchInput.split(":")[1];
    } else {
      return searchInput;
    }
  }, [searchInput, containsPrefix]);

  return { typeAdornment, displayWithoutAdornment };
}
