let initializationErrors: { reason: string; details: string }[] = [];

/**
 * Adds an error to the initialization errors list.
 *
 * @param reason - A brief description of the error reason.
 * @param details - Detailed information about the error.
 */
export function addInitializationError(reason: string, details: string): void {
  initializationErrors.push({ reason, details });
}

/**
 * Retrieves the current list of initialization errors.
 *
 * @returns An array of initialization error objects.
 */
export function getInitializationErrors(): {
  reason: string;
  details: string;
}[] {
  return initializationErrors;
}

/**
 * Clears the list of initialization errors.
 */
export function clearInitializationErrors(): void {
  initializationErrors = [];
}

export default initializationErrors;
