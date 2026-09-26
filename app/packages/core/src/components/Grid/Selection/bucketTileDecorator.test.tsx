import {
  bucketsAtom,
  selectionAtom,
} from "@fiftyone/state/src/selection/model/atoms";
import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setHoveredTile } from "../gridTileRegistry";
import { useTileDecorators } from "../tileDecorators";
import { useTrackHeldGesture } from "./bucketGestures";
import {
  BucketTileChips,
  useBucketTileDecorator,
  type TileBucketController,
} from "./bucketTileDecorator";

const unit = { one: "sample", many: "samples", temporal: false };
const whole = (id: string): EpisodeSelection => ({
  episodeId: id,
  members: [{ episodeId: id, kind: "episode" }],
});

function Harness({
  enabled,
  controller,
}: {
  enabled: boolean;
  controller: TileBucketController;
}) {
  useBucketTileDecorator(enabled, controller);
  useTrackHeldGesture(enabled);
  return <span data-decorators={useTileDecorators().length} />;
}

afterEach(() => {
  cleanup();
  setHoveredTile(null);
});

describe("bucket tile chips", () => {
  it("registers only while several buckets exist", () => {
    const controller: TileBucketController = {
      datasetId: "ds",
      domainId: "ds",
      unit,
      select: vi.fn(),
    };
    const registered = () =>
      document.querySelector<HTMLElement>("[data-decorators]")?.dataset
        .decorators;
    const view = render(<Harness enabled={false} controller={controller} />);
    expect(registered()).toBe("0");
    view.rerender(<Harness enabled controller={controller} />);
    expect(registered()).toBe("1");
    view.unmount();
  });

  it("marks membership, offers the other buckets on hover, and never opens the tile", () => {
    const store = createStore();
    store.set(bucketsAtom("ds"), [
      { id: "primary", name: "Keep" },
      { id: "b2", icon: "reject" },
      { id: "b3" },
    ]);
    store.set(selectionAtom("ds#b2"), new Map([["tile", whole("tile")]]));
    const select = vi.fn();
    const controller: TileBucketController = {
      datasetId: "ds",
      domainId: "ds",
      unit,
      select,
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const opened = vi.fn();
    const { container } = render(
      <>
        <Harness enabled controller={controller} />
        <div data-tile="">
          <BucketTileChips
            sampleId="tile"
            datasetId="ds"
            domainId="ds"
            unit={unit}
          />
        </div>
      </>,
      { wrapper },
    );
    // Spotlight listens for clicks on the tile element itself.
    container.querySelector("[data-tile]")?.addEventListener("click", opened);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const member = screen.getByRole("button", { name: "Remove from Bucket 2" });
    expect(member.getAttribute("aria-pressed")).toBe("true");
    act(() => setHoveredTile("tile"));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    act(() => setHoveredTile("tile", true));
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(
      screen
        .getByRole("button", { name: "Add to Keep" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    expect(
      screen
        .getByRole("button", { name: "Add to Bucket 3" })
        .hasAttribute("data-armed"),
    ).toBe(true);
    expect(member.hasAttribute("data-armed")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add to Keep" }));
    expect(select).toHaveBeenCalledWith("tile", "primary", false);
    fireEvent.click(member);
    expect(select).toHaveBeenCalledWith("tile", "b2", false);
    fireEvent.click(member, { shiftKey: true, altKey: true });
    expect(select).toHaveBeenLastCalledWith("tile", "b2", true);
    expect(select).toHaveBeenCalledTimes(3);
    expect(opened).not.toHaveBeenCalled();
    act(() => setHoveredTile("tile"));
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders nothing for the single-bucket tray or a tile in no bucket", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const view = render(
      <BucketTileChips
        sampleId="tile"
        datasetId="ds"
        domainId="ds"
        unit={unit}
      />,
      { wrapper },
    );
    expect(screen.queryByRole("button")).toBeNull();
    store.set(bucketsAtom("ds"), [{ id: "primary" }, { id: "b2" }]);
    view.rerender(
      <BucketTileChips
        sampleId="tile"
        datasetId="ds"
        domainId="ds"
        unit={unit}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    act(() => setHoveredTile("tile"));
    expect(screen.queryByRole("button")).toBeNull();
    act(() => setHoveredTile("tile", true));
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
