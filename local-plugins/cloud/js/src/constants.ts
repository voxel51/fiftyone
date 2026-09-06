/**
 * The names the browser shares with `constants.py`. Kept apart from
 * `types.ts` so a component can import a URI without pulling the whole
 * data contract.
 */

export const PLUGIN_NAME = "@voxel51/cloud";
export const PUSH_OPERATOR_URI = `${PLUGIN_NAME}/push_to_cloud`;
export const SUBSCRIPTION_OPERATOR_URI = `${PLUGIN_NAME}/cloud_push_subscription`;

/** The single key in the `cloud_push` execution store. */
export const PUSH_KEY = "push";
