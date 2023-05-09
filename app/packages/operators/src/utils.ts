export function stringifyError(error, fallback?) {
  if (typeof error === "string") return error;
  return (
    error?.stack ||
    error?.bodyResponse?.error?.message ||
    error?.bodyResponse?.stack ||
    error?.bodyResponse?.toString?.() ||
    error?.toString?.() ||
    fallback ||
    "No details available for the error"
  );
}
