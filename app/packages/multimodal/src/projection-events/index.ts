/**
 * Projection-events route client and React hooks. Read-only for M1 —
 * events are surfaced in the tracks timeline but not mutated here.
 */
export { createProjectionEventsClient } from "./client";
export { createMockProjectionEventsClient } from "./mock";
export {
  useEpisodeProjectionEvents,
  useSampleRendererProjectionEvents,
} from "./hooks";
export type { CreateProjectionEventsClientOptions } from "./client";
export type {
  ListEpisodeProjectionEventsRequest,
  ProjectionEvent,
  ProjectionEventFilter,
  ProjectionEventsClient,
  ProjectionEventsStatus,
  UseEpisodeProjectionEventsOptions,
  UseEpisodeProjectionEventsResult,
} from "./types";
