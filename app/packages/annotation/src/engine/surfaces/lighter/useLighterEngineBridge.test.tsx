import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LabelRef } from "../../identity/ref";

// captured lighter event handlers, keyed by event name
const handlers = new Map<string, (payload: unknown) => void>();
const mockOn = vi.fn((event: string, handler: (payload: unknown) => void) => {
  handlers.set(event, handler);
});

// the scene "renders" exactly these overlay ids
const ownedIds = new Set<string>();

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({
    scene: {
      getEventChannel: () => "channel",
      getOverlay: (id: string) => (ownedIds.has(id) ? { id } : undefined),
      isDestroyed: false,
    },
    overlayFactory: {},
  }),
  useLighterEventHandler: () => mockOn,
}));

// isolate the wiring hook from the read-half loop — we only exercise the
// interaction routes it registers
vi.mock("./lighterBridge", () => ({
  createLighterBridge: () => ({ clear: vi.fn() }),
}));
vi.mock("./adapters", () => ({ lighterAdapters: {} }));
vi.mock("../../react/useSurfaceBridge", () => ({
  useSurfaceBridge: () => ({}),
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
