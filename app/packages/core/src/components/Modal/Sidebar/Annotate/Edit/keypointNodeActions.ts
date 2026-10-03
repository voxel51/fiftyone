/**
 * Keypoint node checklist row actions: which single button a row of
 * `KeypointDetails` offers, given the node's status and whether keypoint
 * placement mode is armed.
 */

/**
 * A skeleton node's state in the checklist: `placed` (finite point),
 * `target` (the node the next guided click places), `skipped` (the guided
 * cursor deliberately passed it), `pending` (still a hole, not yet reached).
 */
export type NodeStatus = "placed" | "target" | "skipped" | "pending";

export type NodeRowAction = "skip" | "clear" | "place";

/**
 * The row's one action button.
 *
 * `placed` clears back to a hole, and any unreached hole (`skipped` /
 * `pending`) offers Place — it force-targets the node and arms the mode.
 *
 * The target row is the one that depends on arming. Armed, the canvas click
 * IS its placement, so Skip (pass this node by) is the only button that adds
 * anything. Unarmed — how an existing label opens, since inspection is not an
 * invitation to place (Tim, 2026-09-21) — Skip would be a dead end: the row
 * needs Place, its only way into placement.
 */
export const nodeRowAction = (
  status: NodeStatus,
  modeActive: boolean,
): NodeRowAction => {
  switch (status) {
    case "placed":
      return "clear";
    case "target":
      return modeActive ? "skip" : "place";
    case "skipped":
    case "pending":
      return "place";
  }
};
