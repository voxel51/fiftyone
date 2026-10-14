import {
  activeAtom,
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
import { useTileDecorators } from "../tileDecorators";
import {
  SectionCheckbox,
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
  return <span data-decorators={useTileDecorators().length} />;
}

afterEach(cleanup);

describe("section checkboxes", () => {
  it("registers only while the tray is split", () => {
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

  it("fills a picked tile with its sections' shapes and works like its checkbox", () => {
    const store = createStore();
    store.set(bucketsAtom("ds"), [
      { id: "primary", name: "Keep" },
      { id: "b2", icon: "thumbsDown" },
      { id: "b3" },
    ]);
    store.set(selectionAtom("ds"), new Map([["tile", whole("tile")]]));
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
          <SectionCheckbox
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
    const mark = screen.getByRole("button", {
      name: "This sample is in Keep, Section 2",
    });
    expect(mark.getAttribute("aria-pressed")).toBe("true");
    // one shape per section holding the tile
    expect(mark.querySelectorAll("svg")).toHaveLength(2);
    fireEvent.click(mark);
    expect(select).toHaveBeenLastCalledWith("tile", false);
    fireEvent.click(mark, { shiftKey: true });
    expect(select).toHaveBeenLastCalledWith("tile", true);
    expect(opened).not.toHaveBeenCalled();
  });

  it("offers an unpicked tile the shape a pick would land in, and nothing for one strip", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const checkbox = (
      <SectionCheckbox
        sampleId="tile"
        datasetId="ds"
        domainId="ds"
        unit={unit}
      />
    );
    const view = render(checkbox, { wrapper });
    expect(screen.queryByRole("button")).toBeNull();
    act(() => store.set(bucketsAtom("ds"), [{ id: "primary" }, { id: "b2" }]));
    // picks land in the active section, the first until another is pressed
    const pick = screen.getByRole("button", {
      name: "Pick this sample into Section 1",
    });
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    expect(pick.querySelectorAll("svg")).toHaveLength(1);
    act(() => store.set(activeAtom("ds"), "b2"));
    expect(
      screen.getByRole("button", { name: "Pick this sample into Section 2" }),
    ).toBeTruthy();
    view.unmount();
  });
});
