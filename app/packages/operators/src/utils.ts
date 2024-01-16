import { getFetchParameters, getFetchPathPrefix } from "@fiftyone/utilities";
import { KeyboardEventHandler } from "react";

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

export function onEnter(
  handler: (e: KeyboardEvent) => void
): KeyboardEventHandler {
  // @ts-ignore
  return (e: KeyboardEvent) => {
    if (e.key === "Enter") handler(e);
  };
}

export function resolveServerPath(plugin) {
  const { pathPrefix } = getFetchParameters();
  return pathPrefix + plugin.serverPath;
}

export function formatValidationErrors(errors: []) {
  if (!Array.isArray(errors) || errors.length === 0) return "";
  return errors
    .map(({ path, reason }) => `params.${path}: ${reason}`)
    .join("\n");
}
