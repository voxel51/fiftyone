import { getAbortableOperationQueue } from "./AbortableOperation";

/**
 * Aborts all ongoing operations for the specified operator URI.
 *
 * @param uri - The URI of the operator to abort operations for.
 */
export default function abortOperationsByURI(uri: string): void {
  const abortableOperationQueue = getAbortableOperationQueue();
  abortableOperationQueue.abortByURI(uri);
}
