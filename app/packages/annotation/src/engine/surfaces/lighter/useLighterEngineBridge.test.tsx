import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LabelRef } from "../../identity/ref";

// captured lighter event handlers, keyed by event name
const handlers = new Map<string, (payload: unknown) => void>();
const mockOn = vi.fn((event: string, handler: (payload: unknown) => void) => {
  handlers.set(event, handler);
});

// the scene "renders" exactly these overlay ids; a subset carry a mask
const ownedIds = new Set<string>();
const maskedIds = new Set<string>();

class MockDetectionOverlay {
  constructor(readonly id: string, private readonly masked: boolean) {}
  hasMask(): boolean {
    return this.masked;
  }
}

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({
    scene: {
      getEventChannel: () => "channel",
      getOverlay: (id: string) =>
        ownedIds.has(id)
          ? new MockDetectionOverlay(id, maskedIds.has(id))
          : undefined,
      isDestroyed: false,
    },
    overlayFactory: {},
  }),
  useLighterEventHandler: () => mockOn,
  DetectionOverlay: MockDetectionOverlay,
}));

// isolate the wiring hook from the read-half loop — we only exercise the
// interaction routes it registers
vi.mock("./lighterBridge", () => ({
  createLighterBridge: () => ({ clear: vi.fn() }),
}));
vi.mock("./adapters", () => ({ createLighterAdapters: () => ({}) }));
const mockCommit = vi.fn();
const mockSelectHandle = vi.fn();
vi.mock("../../react/useSurfaceBridge", () => ({
  useSurfaceBridge: () => ({
    commit: mockCommit,
    selectHandle: mockSelectHandle,
  }),
}));

const { useLighterEngineBridge } = await import("./useLighterEngineBridge");

const mockPruneHovered = vi.fn();
let hovered: LabelRef[] = [];

const makeEngine = () =>
  ({
    getLabel: vi.fn(),
    interaction: {
      getHovered: () => hovered,
      pruneHovered: mockPruneHovered,
    },
  } as never);

const allUnhover = () =>
  handlers.get("lighter:overlay-all-unhover")?.(undefined);

describe("useLighterEngineBridge — overlay-all-unhover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    hovered = [];
    ownedIds.clear();
  });

  it("prunes only the hovered refs this scene renders, leaving other surfaces' untouched", () => {
    ownedIds.add("a").add("b");
    const own: LabelRef = { sample: "s1", path: "gt", instanceId: "a" };
    hovered = [
      own,
      // a foreign surface's hover (e.g. a 3D cuboid) — not in this scene
      { sample: "s1", path: "gt", instanceId: "z" },
      // a cross-slice linkage twin: same id this scene renders, other sample
      { sample: "s2", path: "gt", instanceId: "b" },
    ];

    renderHook(() =>
      useLighterEngineBridge({
        engine: makeEngine(),
        sample: "s1",
        dataset: "ds",
      })
    );
    allUnhover();

    expect(mockPruneHovered).toHaveBeenCalledWith([own]);
  });

  it("prunes nothing when no hovered ref belongs to this scene", () => {
    hovered = [{ sample: "s1", path: "gt", instanceId: "z" }];

    renderHook(() =>
      useLighterEngineBridge({
        engine: makeEngine(),
        sample: "s1",
        dataset: "ds",
      })
    );
    allUnhover();

    expect(mockPruneHovered).toHaveBeenCalledWith([]);
  });
});

describe("useLighterEngineBridge — mask gesture coalescing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    ownedIds.clear();
    maskedIds.clear();
  });

  const mount = () =>
    renderHook(() =>
      useLighterEngineBridge({
        engine: makeEngine(),
        sample: "s1",
        dataset: "ds",
      })
    );

  const fire = (event: string, overlayId: string) =>
    handlers.get(event)?.({ overlayId });

  const keyOf = (call: number): string | undefined =>
    mockCommit.mock.calls[call]?.[1]?.undoKey;

  it("shares one undoKey across a paint-end and its async mask re-commit", () => {
    ownedIds.add("a");
    maskedIds.add("a");
    mount();

    fire("lighter:overlay-paint-end", "a");
    fire("lighter:overlay-commit-requested", "a");

    expect(mockCommit).toHaveBeenCalledTimes(2);
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("shares one undoKey across establish + paint-end + the async mask tail", () => {
    ownedIds.add("a");
    maskedIds.add("a");
    mount();

    fire("lighter:overlay-establish", "a");
    fire("lighter:overlay-paint-end", "a");
    fire("lighter:overlay-commit-requested", "a");

    expect(mockCommit).toHaveBeenCalledTimes(3);
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it("gives the next gesture a distinct key so independent edits don't merge", () => {
    ownedIds.add("a");
    maskedIds.add("a");
    mount();

    fire("lighter:overlay-paint-end", "a");
    fire("lighter:overlay-commit-requested", "a");
    fire("lighter:overlay-paint-end", "a");

    expect(keyOf(2)).toBeTruthy();
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it("does not retain a key for a maskless establish, so a later mask edit stays a separate undo unit", () => {
    // a plain box draw (no mask) followed by a sidebar "Add mask" on the same
    // overlay: the establish must NOT leave a key for the later init to inherit
    ownedIds.add("a");
    mount();

    fire("lighter:overlay-establish", "a");
    fire("lighter:overlay-commit-requested", "a");

    expect(mockCommit).toHaveBeenCalledTimes(2);
    expect(keyOf(0)).toBeTruthy(); // the draw has its own key
    expect(keyOf(1)).toBeUndefined(); // the later mask edit does not coalesce in
  });

  it("leaves a standalone label-updated (no preceding finalize) uncoalesced", () => {
    ownedIds.add("a");
    mount();

    fire("lighter:overlay-commit-requested", "a");

    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(keyOf(0)).toBeUndefined();
  });

  it("stamps the event's gestureId on the commit (merge), so its commits share one key", () => {
    ownedIds.add("t");
    mount();

    // the two label-updateds a merge emits (sync bbox + async mask re-encode)
    // both carry the gesture id, so they coalesce regardless of timing
    handlers.get("lighter:overlay-commit-requested")?.({
      overlayId: "t",
      gestureId: "gesture:9",
    });
    handlers.get("lighter:overlay-commit-requested")?.({
      overlayId: "t",
      gestureId: "gesture:9",
    });

    expect(keyOf(0)).toBe("gesture:9");
    expect(keyOf(1)).toBe("gesture:9");
  });
});
