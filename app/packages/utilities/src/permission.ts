export function canPerformAction(
  allowed: boolean,
  readOnly: boolean,
  action?: string
): CanPerformActionReturnType {
  const enable = allowed && !readOnly;
  let message;
  if (action) {
    if (!allowed) {
      message = `You do not have permission to ${action}`;
    } else if (readOnly) {
      message = `You cannot ${action} in read-only mode`;
    }
  }
  return [enable, message, enable ? "pointer" : "not-allowed"];
}

type CanPerformActionReturnType = [
  boolean,
  string | undefined,
  "pointer" | "not-allowed"
];
