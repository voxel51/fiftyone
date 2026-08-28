/** Bounds browser-native video decoders retained by episode grid cells. */
export const GRID_NATIVE_VIDEO_CAP = 2;

type GridNativeVideoPriority = "playing" | "poster";

/** Handle for one pending or active native-video decoder lease. */
export interface GridNativeVideoLeaseRequest {
  release(): void;
}

interface LeaseRecord {
  readonly holderId: string;
  readonly onGranted: () => void;
  readonly onRevoked: () => void;
  readonly priority: GridNativeVideoPriority;
  readonly request: GridNativeVideoLeaseRequest;
  state: "active" | "pending" | "released";
}

const active = new Map<string, LeaseRecord>();
const pending = new Map<string, LeaseRecord>();

/**
 * Requests one native decoder slot. Playing work may revoke the oldest poster
 * capture, while ordinary poster requests wait FIFO for a slot.
 */
export function requestGridNativeVideoLease(
  holderId: string,
  priority: GridNativeVideoPriority,
  onGranted: () => void,
  onRevoked: () => void,
): GridNativeVideoLeaseRequest {
  active.get(holderId)?.request.release();
  pending.get(holderId)?.request.release();

  const record: LeaseRecord = {
    holderId,
    onGranted,
    onRevoked,
    priority,
    request: {
      release() {
        if (record.state === "released") return;
        const wasActive = record.state === "active";
        record.state = "released";
        active.delete(holderId);
        pending.delete(holderId);
        if (wasActive) pump();
      },
    },
    state: "pending",
  };
  pending.set(holderId, record);

  if (priority === "playing" && active.size >= GRID_NATIVE_VIDEO_CAP) {
    const poster = [...active.values()].find(
      (candidate) => candidate.priority === "poster",
    );
    if (poster) revoke(poster);
  }
  pump();
  return record.request;
}

/** Current scheduler counts exposed to the focused lease tests. */
export function gridNativeVideoLeaseStats() {
  return {
    active: active.size,
    cap: GRID_NATIVE_VIDEO_CAP,
    pending: pending.size,
  } as const;
}

/** Test-only reset. */
export function resetGridNativeVideoLeasesForTests(): void {
  for (const record of [...active.values(), ...pending.values()]) {
    record.state = "released";
  }
  active.clear();
  pending.clear();
}

function pump(): void {
  while (active.size < GRID_NATIVE_VIDEO_CAP && pending.size > 0) {
    const record =
      [...pending.values()].find(
        (candidate) => candidate.priority === "playing",
      ) ?? pending.values().next().value;
    if (!record) return;
    pending.delete(record.holderId);
    if (record.state !== "pending") continue;
    record.state = "active";
    active.set(record.holderId, record);
    try {
      record.onGranted();
    } catch {
      record.request.release();
    }
  }
}

function revoke(record: LeaseRecord): void {
  if (record.state !== "active") return;
  active.delete(record.holderId);
  record.state = "pending";
  pending.set(record.holderId, record);
  try {
    record.onRevoked();
  } catch {
    // A failed holder fallback must not prevent the interactive grant.
  }
}
