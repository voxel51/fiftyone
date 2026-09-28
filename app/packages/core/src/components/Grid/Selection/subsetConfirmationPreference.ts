type SubsetAction = "delete" | "remove";

const KEYS: Record<SubsetAction, string> = {
  delete: "fiftyone.subsets.skipDeleteConfirmation.v1",
  remove: "fiftyone.subsets.skipRemoveConfirmation.v1",
};

/** Reads this browser's opt-out for the requested subset operation. */
export function skipSubsetConfirmation(action: SubsetAction) {
  try {
    return localStorage.getItem(KEYS[action]) === "true";
  } catch {
    // Browsers that block storage should always ask for confirmation.
    return false;
  }
}

/** Saves the confirmation opt-out locally after a successful operation. */
export function rememberSubsetConfirmation(action: SubsetAction) {
  try {
    localStorage.setItem(KEYS[action], "true");
  } catch {
    // The operation still succeeds when browser preferences cannot be saved.
  }
}
