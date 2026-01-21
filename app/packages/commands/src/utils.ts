export function isUndoable(object: object) {
  return "undo" in object && typeof object.undo === "function";
}
