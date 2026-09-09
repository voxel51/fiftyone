import { diagnosticMessage } from "../../../utils/errors";

/** Maps source failures to the copy shown by episode surfaces. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (isHttpNotFoundError(error)) {
    return "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.";
  }

  return diagnosticMessage(error, fallback);
}

function isHttpNotFoundError(error: unknown): error is Error & { code: 404 } {
  return error instanceof Error && "code" in error && error.code === 404;
}
