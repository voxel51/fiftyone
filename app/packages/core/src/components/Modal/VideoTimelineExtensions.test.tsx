// @vitest-environment jsdom
import {
  publishSampleFocus,
  registerTimelineExtension,
  type TimelineExtensionComponentProps,
} from "@fiftyone/multimodal/extensions/timeline";
import type * as fos from "@fiftyone/state";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  durationSec: 7,
  seek: vi.fn(),
  tracksProps: vi.fn(),
}));

vi.mock("@fiftyone/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/state")>()),
  useCurrentDataset: () => ({ name: "traffic", datasetId: "dataset-1" }),
  useModalSampleSchema: () => ({}),
  useSelectedMediaFieldModal: () => "filepath",
}));
vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  useDuration: () => env.durationSec,
  usePlayback: () => ({ seek: env.seek }),
}));

vi.mock("@fiftyone/video-annotation", () => ({
  FrameLabelsTracks: (props: unknown) => {
    env.tracksProps(props);
    return null;
  },
}));

import {
  AnnotateTimelineExtensions,
  VideoTimelineExtensions,
} from "./VideoTimelineExtensions";

const SAMPLE = {
  sample: { _id: "sample-1", filepath: "/videos/clip.mp4" },
} as unknown as fos.ModalSample;

const ROW = {
  id: "test:row::video",
  label: "video",
  color: "#000",
  events: [],
};

let unregister: (() => void) | undefined;
afterEach(() => {
  cleanup();
  publishSampleFocus(null);
  env.seek.mockReset();
  env.tracksProps.mockReset();
  unregister?.();
  unregister = undefined;
});

describe("VideoTimelineExtensions", () => {
  it("opens a video at its published focus", () => {
    publishSampleFocus({ "sample-1": { startUs: 2_500_000 } });

    render(<VideoTimelineExtensions sample={SAMPLE} />);

    expect(env.seek).toHaveBeenCalledTimes(1);
    expect(env.seek).toHaveBeenCalledWith(2.5);
  });

  it("runs the timeline extensions for this video, from time 0 to its end, and shows their rows after the host's", () => {
    const seen = vi.fn();
    unregister = registerTimelineExtension({
      id: "test:probe",
      order: 1,
      Component: ({
        children,
        ...context
      }: TimelineExtensionComponentProps) => {
        seen(context);
        return (
          <>
            {children({
              sections: [
                { id: "test:rows", label: "Rows", order: 1, tracks: [ROW] },
              ],
            })}
          </>
        );
      },
    });
    const hostRow = { ...ROW, id: "fiftyone:saved-segments:all" };

    render(
      <VideoTimelineExtensions sample={SAMPLE} additionalTracks={[hostRow]} />,
    );

    const context = seen.mock.lastCall?.[0];
    expect(context.ctx.sample.sample._id).toBe("sample-1");
    expect(context.ctx.media.path).toBe("/videos/clip.mp4");
    expect(context.timeRange).toEqual({ startNs: 0n, endNs: 7_000_000_000n });
    expect(env.tracksProps.mock.lastCall?.[0].additionalTracks).toEqual([
      hostRow,
      ROW,
    ]);
  });
});

describe("AnnotateTimelineExtensions", () => {
  const registerRowsAndRuler = (overlay: (labelWidth: number) => string) =>
    registerTimelineExtension({
      id: "test:ruler",
      order: 1,
      Component: ({ children }: TimelineExtensionComponentProps) => (
        <>
          {children({
            sections: [
              { id: "test:rows", label: "Rows", order: 1, tracks: [ROW] },
            ],
            rulerOverlay: overlay,
            runtime: <span data-cy="test-runtime" />,
          })}
        </>
      ),
    });

  it("draws the extensions' ruler overlays and nothing else they contribute", () => {
    unregister = registerRowsAndRuler((labelWidth) => `marker@${labelWidth}`);
    const hostRow = { ...ROW, id: "fiftyone:host-row" };

    render(
      <AnnotateTimelineExtensions
        sample={SAMPLE}
        additionalTracks={[hostRow]}
      />,
    );

    const props = env.tracksProps.mock.lastCall?.[0];
    expect(props.additionalTracks).toEqual([hostRow]);
    expect(props.decorateAdditionalTrack).toBeUndefined();
    expect(props.runtime).toBeUndefined();
    expect(render(<>{props.rulerOverlay(120)}</>).container.textContent).toBe(
      "marker@120",
    );
  });

  it("leaves the playhead where it is when the video has a published focus", () => {
    publishSampleFocus({ "sample-1": { startUs: 2_500_000 } });

    render(<AnnotateTimelineExtensions sample={SAMPLE} />);

    expect(env.seek).not.toHaveBeenCalled();
  });
});
