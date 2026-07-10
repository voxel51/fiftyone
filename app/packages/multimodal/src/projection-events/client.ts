import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type {
  ListEpisodeProjectionEventsRequest,
  ProjectionEvent,
  ProjectionEventFilter,
  ProjectionEventsClient,
} from "./types";

type ProjectionEventsFetch = ReturnType<typeof getFetchFunctionExtended>;

/**
 * Wire shape of one event row. The events-grain resolver emits exactly
 * `id, name, start_timestamp_ns, end_timestamp_ns, episode_id`; the
 * int64 nanosecond fields are decimal strings so they survive JSON
 * without the precision loss `number` would incur past 2^53.
 */
type ProjectionEventDto = {
  readonly id: string;
  readonly name: string;
  readonly start_timestamp_ns: string;
  readonly end_timestamp_ns: string;
  readonly episode_id: string;
};

type ProjectionEventsResponseDto = {
  readonly events: readonly ProjectionEventDto[];
};

/** Options for constructing the projection-events route client. */
export interface CreateProjectionEventsClientOptions {
  readonly fetchFunction?: ProjectionEventsFetch;
}

/**
 * Creates a typed client for the (read-only) projection-events HTTP route.
 *
 * NOTE: the route below is not wired on the server yet — the events-grain
 * resolver + FO-app route are a separate backend deliverable. Until then,
 * callers should use {@link createMockProjectionEventsClient}. The path is
 * a placeholder pending the backend contract; confirm before relying on it.
 */
export function createProjectionEventsClient(
  options: CreateProjectionEventsClientOptions = {},
): ProjectionEventsClient {
  const fetchFunction = options.fetchFunction ?? getFetchFunctionExtended();

  return {
    async listEpisodeProjectionEvents({
      datasetId,
      episodeId,
      filter,
    }: ListEpisodeProjectionEventsRequest) {
      const response = await fetchFunction<
        undefined,
        ProjectionEventsResponseDto
      >({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(
            datasetId,
          )}/episode/${encodeURIComponent(episodeId)}/events`,
          filter,
        ),
      });

      return response.response.events.map(projectionEventFromDto);
    },
  };
}

function withFilterQuery(
  path: string,
  filter: ProjectionEventFilter | undefined,
) {
  const params = filterQueryParams(filter);
  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function filterQueryParams(filter: ProjectionEventFilter | undefined) {
  const params = new URLSearchParams();
  if (!filter) {
    return params;
  }

  if (filter.projection !== undefined) {
    params.append("projection", filter.projection);
  }
  if (filter.startNs !== undefined) {
    params.append("start", filter.startNs.toString());
  }
  if (filter.stopNs !== undefined) {
    params.append("stop", filter.stopNs.toString());
  }
  for (const eventId of filter.eventIds ?? []) {
    params.append("event_ids", eventId);
  }

  return params;
}

function projectionEventFromDto(dto: ProjectionEventDto): ProjectionEvent {
  return {
    id: dto.id,
    name: dto.name,
    startTimestampNs: BigInt(dto.start_timestamp_ns),
    endTimestampNs: BigInt(dto.end_timestamp_ns),
    episodeId: dto.episode_id,
  };
}
