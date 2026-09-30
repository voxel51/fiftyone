import { resolveSelectionDetails, type SelectionRequest } from "../client";
import type { SelectionMember } from "../types";

type Segment = Extract<SelectionMember, { kind: "segment" }>;
interface SegmentDetails {
  readonly members: readonly Segment[];
  readonly loading: boolean;
  readonly error: string | null;
}

export const EMPTY_SEGMENTS: SegmentDetails = {
  members: [],
  loading: false,
  error: null,
};
const LOADING: SegmentDetails = { ...EMPTY_SEGMENTS, loading: true };

/** Only mounted samples are retained; one request describes a batch of tiles. */
export function createSegmentDetailsLoader(
  datasetId: string,
  request: SelectionRequest,
) {
  const entries = new Map<
    string,
    { value: SegmentDetails; listeners: Set<() => void> }
  >();
  const pending = new Set<string>();
  const controllers = new Set<AbortController>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    const ids = [...pending];
    pending.clear();
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      const targets = batch.map((id) => entries.get(id));
      const controller = new AbortController();
      controllers.add(controller);
      resolveSelectionDetails(
        datasetId,
        { ...request, episodeIds: batch, expand: undefined },
        controller.signal,
      )
        .then(({ groups }) => {
          const byId = new Map(groups.map((group) => [group.episodeId, group]));
          batch.forEach((id, index) => {
            const entry = targets[index];
            if (!entry || entries.get(id) !== entry) return;
            entry.value = {
              members: (byId.get(id)?.members ?? []).filter(
                (member): member is Segment => member.kind === "segment",
              ),
              loading: false,
              error: null,
            };
            entry.listeners.forEach((notify) => notify());
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          batch.forEach((id, index) => {
            const entry = targets[index];
            if (!entry || entries.get(id) !== entry) return;
            entry.value = { ...EMPTY_SEGMENTS, error: String(error) };
            entry.listeners.forEach((notify) => notify());
          });
        })
        .finally(() => controllers.delete(controller));
    }
  };

  return {
    get: (id: string) => entries.get(id)?.value ?? LOADING,
    subscribe: (id: string, notify: () => void) => {
      let entry = entries.get(id);
      if (!entry) {
        entry = { value: LOADING, listeners: new Set() };
        entries.set(id, entry);
        pending.add(id);
        timer ??= setTimeout(flush, 0);
      }
      entry.listeners.add(notify);
      return () => {
        entry.listeners.delete(notify);
        if (entry.listeners.size) return;
        entries.delete(id);
        pending.delete(id);
        if (!entries.size) {
          clearTimeout(timer);
          timer = undefined;
          controllers.forEach((controller) => controller.abort());
        }
      };
    },
  };
}
