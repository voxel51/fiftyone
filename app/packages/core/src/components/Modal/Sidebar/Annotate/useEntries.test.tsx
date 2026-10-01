/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { AnnotationEngine } from "@fiftyone/annotation/src/engine/core/engine";
import { FrameStore } from "@fiftyone/annotation/src/engine/store/frameStore";
import { FrameTemporalView } from "@fiftyone/annotation/src/engine/temporal/frameTemporalView";
import { EntryKind } from "@fiftyone/state";
import { LabelType, type LabelData } from "@fiftyone/utilities";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { describe, expect, it, vi } from "vitest";

const { harness, SAMPLE, PATH } = vi.hoisted(() => ({
  harness: { engine: null as unknown as AnnotationEngine },
  SAMPLE: "group-sample",
  PATH: "ground_truth",
}));

vi.mock("@fiftyone/annotation", async () => {
  const hooks = await vi.importActual<
    typeof import("@fiftyone/annotation/src/engine/react/hooks")
  >("@fiftyone/annotation/src/engine/react/hooks");
  return {
    useAnnotationEngine: () => harness.engine,
    useActiveAnnotationSampleId: () => SAMPLE,
    useTemporal: hooks.useTemporal,
  };
});
vi.mock("./state", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai");
  return { visibleLabelSchemas: atom([PATH]) };
});
vi.mock("./useLabels", () => ({ useAnnotationLabelsReady: () => true }));
vi.mock("./usePrimitiveEntries", () => ({ default: () => [] }));
vi.mock(
  "../../../Sidebar/InteractiveSidebar/useRegisterSidebarCommandHandlers",
  () => ({ useRegisterSidebarCommandHandlers: () => undefined }),
);

import InteractiveSidebar from "../../../Sidebar/InteractiveSidebar/InteractiveSidebar";
import useEntries from "./useEntries";

const detection = (id: string, label: string, track?: string): LabelData => ({
  _id: id,
  _cls: "Detection",
  label,
  ...(track ? { instance: { _id: track, _cls: "Instance" } } : {}),
});

/**
 * An engine playing a two-frame clip of `frames`, with a clock the test steps.
 * A dynamic group's frames are separate image samples, so their detections are
 * untracked: each frame's box has its own `_id` and no `instance`/`index`.
 */
const playClip = (frames: Record<number, LabelData[]>) => {
  const engine = new AnnotationEngine();
  const store = new FrameStore(SAMPLE, {
    labelTypes: { [PATH]: LabelType.Detections },
    data: Object.fromEntries(
      Object.entries(frames).map(([frame, labels]) => [
        frame,
        { [PATH]: labels },
      ]),
    ),
  });
  engine.registerStore(store);

  let frame = 1;
  const listeners = new Set<(time: number) => void>();
  engine.attachTemporal(
    (e) =>
      new FrameTemporalView(
        e,
        {
          getTime: () => frame,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        (time) => time,
      ),
  );
  harness.engine = engine;

  return (next: number) =>
    act(() => {
      frame = next;
      listeners.forEach((listener) => listener(next));
    });
};

const renderSidebar = () =>
  render(
    <ThemeProvider theme={{ background: {} }}>
      <InteractiveSidebar
        isDisabled={() => true}
        modal
        useEntries={useEntries}
        render={(_key, _group, entry) => ({
          children:
            entry.kind === EntryKind.LABEL ? (
              <div data-testid="label-row" data-instance={entry.id} />
            ) : null,
        })}
      />
    </ThemeProvider>,
  );

/** Each row's sidebar item element, which the sidebar keys by entry. */
const labelRows = () =>
  screen.getAllByTestId("label-row").map((row) => row.parentElement);

describe("annotate sidebar label rows across playhead frames", () => {
  it("keeps each untracked dynamic-group row mounted as the frame advances", () => {
    const seek = playClip({
      1: [detection("car-1", "car"), detection("person-1", "person")],
      2: [detection("car-2", "car"), detection("person-2", "person")],
    });
    renderSidebar();
    const before = labelRows();

    seek(2);

    expect(
      screen.getAllByTestId("label-row").map((row) => row.dataset.instance),
    ).toEqual(["car-2", "person-2"]);
    // a remounted item restarts off-screen until it is measured, so each
    // frame step would paint the list blank
    labelRows().forEach((row, index) => expect(row).toBe(before[index]));
  });

  it("keeps tracked native-video rows mounted as the frame advances", () => {
    const seek = playClip({
      1: [detection("car-1", "car", "t1")],
      2: [detection("car-2", "car", "t1")],
    });
    renderSidebar();
    const [before] = labelRows();

    seek(2);

    expect(labelRows()[0]).toBe(before);
  });
});
