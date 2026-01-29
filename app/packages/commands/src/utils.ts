import { Action } from "./actions";

export function isUndoable(object: object) {
  return "undo" in object && typeof object.undo === "function";
}

/**
 * Return whether the provided object adheres to the {@link Action} interface.
 *
 * @param data Object to check
 */
export const isAction = (data: unknown): data is Action => {
  return (
    data !== null &&
    data !== undefined &&
    typeof data === "object" &&
    "execute" in data &&
    typeof data.execute === "function"
  );
};
