import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { IconName } from "@voxel51/voodo";
import {
  Provider as JotaiProvider,
  atom,
  createStore,
  useAtomValue,
  useSetAtom,
} from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TileIdScope, TilingProvider } from "./TilingProvider";
import type { RegisteredTile } from "./types";
import { useTileRegistry } from "./use-tile-registry";
import {
  useSetTileSelection,
  useTileSelection,
  useTileTypes,
} from "./use-tile-state";

afterEach(cleanup);

/**
 * A stand-in for a host's own Jotai state (in the real app: `fos.modalMode`,
 * lighter scene atoms, the annotate label list). The point of
 * `isolateStore={false}` is that a shell embedded in that host can still see
 * and write these.
 */
const hostAtom = atom("host-initial");

const CAMERA_TILE: RegisteredTile = {
  type: "camera",
  typeLabel: "Camera",
  icon: "image" as IconName,
  Tile: () => null,
};

const HostReader: React.FC = () => {
  const value = useAtomValue(hostAtom);
  return <span data-testid="host-value">{value}</span>;
};

const HostWriter: React.FC<{ value: string }> = ({ value }) => {
  const set = useSetAtom(hostAtom);
  return (
    <button type="button" onClick={() => set(value)}>
      write
    </button>
  );
};

describe("TilingProvider store isolation", () => {
  it("shadows host atoms when it owns a private store (the default)", () => {
    const store = createStore();
    store.set(hostAtom, "host-wrote-this");

    render(
      <JotaiProvider store={store}>
        <TilingProvider>
          <HostReader />
        </TilingProvider>
      </JotaiProvider>,
    );

    // The private store never saw the host's write, so the reader falls
    // back to the atom's initial value. This is exactly the failure mode
    // that kept the shell out of the modal.
    expect(screen.getByTestId("host-value").textContent).toBe("host-initial");
  });

  it("lets host atoms resolve normally with isolateStore={false}", () => {
    const store = createStore();
    store.set(hostAtom, "host-wrote-this");

    render(
      <JotaiProvider store={store}>
        <TilingProvider isolateStore={false}>
          <HostReader />
        </TilingProvider>
      </JotaiProvider>,
    );

    expect(screen.getByTestId("host-value").textContent).toBe(
      "host-wrote-this",
    );
  });

  it("propagates writes from inside the shell back to the host store", async () => {
    const store = createStore();

    render(
      <JotaiProvider store={store}>
        <TilingProvider isolateStore={false}>
          <HostWriter value="written-from-tile" />
        </TilingProvider>
        {/* Outside the shell entirely — the host's own chrome. */}
        <HostReader />
      </JotaiProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "write" }).click();
    });

    expect(screen.getByTestId("host-value").textContent).toBe(
      "written-from-tile",
    );
  });

  it("keeps two shells' tile selections apart in one shared store", () => {
    const store = createStore();

    // Both shells generate the same tile id (`camera-1`) from their own
    // fresh counters — the collision the scope key exists to prevent.
    const wrapper =
      (isolateStore: boolean) =>
      ({ children }: { children: React.ReactNode }) => (
        <JotaiProvider store={store}>
          <TilingProvider isolateStore={isolateStore}>
            <TileIdScope tileId="camera-1">{children}</TileIdScope>
          </TilingProvider>
        </JotaiProvider>
      );

    const useBoth = () => ({
      selection: useTileSelection<string>(),
      setSelection: useSetTileSelection(),
    });

    const shellA = renderHook(useBoth, { wrapper: wrapper(false) });
    const shellB = renderHook(useBoth, { wrapper: wrapper(false) });

    act(() => {
      shellA.result.current.setSelection("a");
    });

    expect(shellA.result.current.selection).toBe("a");
    expect(shellB.result.current.selection).toBeNull();

    act(() => {
      shellB.result.current.setSelection("b");
    });

    expect(shellA.result.current.selection).toBe("a");
    expect(shellB.result.current.selection).toBe("b");
  });

  it("keeps two shells' tile-kind registries apart in one shared store", () => {
    const store = createStore();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JotaiProvider store={store}>
        <TilingProvider isolateStore={false}>{children}</TilingProvider>
      </JotaiProvider>
    );

    const useBoth = () => ({
      types: useTileTypes(),
      registry: useTileRegistry(),
    });

    const shellA = renderHook(useBoth, { wrapper });
    const shellB = renderHook(useBoth, { wrapper });

    act(() => {
      shellA.result.current.registry.registerTile(CAMERA_TILE);
    });

    expect(shellA.result.current.types.map((t) => t.type)).toEqual(["camera"]);
    // Without scoping, shell B's "Add tile" menu would list shell A's kinds.
    expect(shellB.result.current.types).toEqual([]);
  });
});
