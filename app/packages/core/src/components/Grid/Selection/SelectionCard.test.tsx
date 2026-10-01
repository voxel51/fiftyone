import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerTile,
  setHoveredTile,
  unregisterTile,
} from "../gridTileRegistry";
import SelectionCard from "./SelectionCard";

const mediaOptions = vi.hoisted(() => ({
  field: "filepath",
  fallback: false,
}));
vi.mock("@fiftyone/state", async () => {
  const { resolveMediaFieldLooker } =
    await import("@fiftyone/state/src/hooks/media-field-lookers");
  const { getNormalizedUrls } = await import("@fiftyone/state/src/utils");
  return {
    getSampleSrc: (path: string) =>
      path.startsWith("https://") ? path : `media://${path}`,
    useSelectedMediaFieldGrid: () => mediaOptions.field,
    useLookerOptions: () => ({ mediaFallback: mediaOptions.fallback }),
    resolveMediaFieldLooker,
    getNormalizedUrls,
  };
});
vi.mock("./RendererPreview", () => ({
  default: ({ node }: { node: { id: string } }) => (
    <div data-grid-tile="" data-node-id={node.id} />
  ),
}));
vi.mock("./LookerPreview", () => ({
  default: ({ node }: { node: { id: string } }) => (
    <div data-testid="3d-preview" data-node-id={node.id} />
  ),
}));

function segment(start: string, end: string) {
  return {
    episodeId: "episode",
    kind: "segment" as const,
    range: {
      start,
      end,
      timebase: "sequence",
      streams: ["filepath"],
      provenance: [],
    },
  };
}
const full: EpisodeSelection = {
  episodeId: "episode",
  filepath: "/videos/drive.mp4",
  members: [{ episodeId: "episode", kind: "episode" }],
};
const captured: EpisodeSelection = {
  ...full,
  members: [segment("10", "30"), segment("60", "75")],
};
const current: EpisodeSelection = {
  ...full,
  members: [segment("0", "20"), segment("34", "50")],
};

const handlers = {
  open: vi.fn(async () => undefined),
  capture: vi.fn(),
  remove: vi.fn(),
};

function Card(props: {
  group: EpisodeSelection;
  candidate?: EpisodeSelection | null;
  locate?: (episodeId: string) => Promise<boolean>;
}) {
  return (
    <SelectionCard
      group={{
        ...props.group,
        node: props.group.node ?? {
          id: props.group.episodeId,
          sample: {
            _id: props.group.episodeId,
            filepath: props.group.filepath,
            _media_type: props.group.filepath?.endsWith(".mp4")
              ? "video"
              : "image",
          },
          urls: [{ field: "filepath", url: props.group.filepath ?? null }],
        },
      }}
      candidate={props.candidate}
      locate={props.locate}
      mediaType="video"
      unit={{ one: "episode", many: "episodes", temporal: true }}
      {...handlers}
    />
  );
}

afterEach(cleanup);

beforeEach(() => {
  mediaOptions.field = "filepath";
  mediaOptions.fallback = false;
  handlers.open.mockClear();
  handlers.capture.mockClear();
  handlers.remove.mockClear();
});

describe("SelectionCard", () => {
  it.each([
    ["image", "gs://bucket/image.jpg", "img"],
    ["video", "s3://bucket/video.mp4", "video"],
  ])(
    "waits for resolved %s media and recovers when its URL changes",
    (mediaType, filepath, tag) => {
      const group = { ...full, filepath, previewStart: 2.5 };
      const props = {
        mediaType,
        unit: {
          one: "sample",
          many: "samples",
          temporal: mediaType === "video",
        },
        ...handlers,
      };
      const view = render(<SelectionCard group={group} {...props} />);
      expect(screen.getByRole("article").querySelector("img,video")).toBeNull();

      const resolved = (signature: string) => ({
        ...group,
        node: {
          id: group.episodeId,
          sample: { _id: group.episodeId, filepath, _media_type: mediaType },
          urls: [
            {
              field: "filepath",
              url: `https://media.example/asset?signature=${signature}`,
            },
          ],
        },
      });
      view.rerender(<SelectionCard group={resolved("first")} {...props} />);
      const media = screen.getByRole("article").querySelector(tag)!;
      expect(media.getAttribute("src")).toBe(
        "https://media.example/asset?signature=first",
      );
      if (tag === "video") {
        fireEvent.loadedMetadata(media);
        expect((media as HTMLVideoElement).currentTime).toBe(2.5);
      }
      fireEvent.error(media);
      expect(screen.getByRole("article").querySelector(tag)).toBeNull();
      view.rerender(<SelectionCard group={resolved("renewed")} {...props} />);
      expect(
        screen.getByRole("article").querySelector(tag)?.getAttribute("src"),
      ).toBe("https://media.example/asset?signature=renewed");
    },
  );

  it("uses the selected thumbnail field and the grid's missing-media fallback", () => {
    const group = {
      ...full,
      node: {
        id: "episode",
        sample: {
          _id: "episode",
          filepath: full.filepath,
          _media_type: "video",
        },
        urls: [
          {
            field: "filepath",
            url: "https://media.example/clip.mp4?signature=video",
          },
          {
            field: "poster",
            url: "https://media.example/poster.jpg?signature=image",
          },
          { field: "missing", url: null },
        ],
      },
    };
    mediaOptions.field = "poster";
    const view = render(<Card group={group} />);
    expect(screen.getByRole("article").querySelector("video")).toBeNull();
    expect(
      screen.getByRole("article").querySelector("img")?.getAttribute("src"),
    ).toBe("https://media.example/poster.jpg?signature=image");
    mediaOptions.field = "missing";
    view.rerender(<Card group={group} />);
    expect(screen.getByRole("article").querySelector("img,video")).toBeNull();
    mediaOptions.fallback = true;
    view.rerender(<Card group={group} />);
    expect(
      screen.getByRole("article").querySelector("video")?.getAttribute("src"),
    ).toBe("https://media.example/clip.mp4?signature=video");
  });

  it.each([
    ["3d", "/scene.fo3d"],
    ["point-cloud", "/cloud.pcd"],
    ["group", "/scene.fo3d"],
    ["group", "/cloud.pcd"],
  ])(
    "previews a %s sample from %s with the grid looker",
    async (mediaType, filepath) => {
      const group = {
        ...full,
        filepath,
        node: {
          id: "episode",
          sample: { _id: "episode", filepath },
          urls: [{ field: "filepath", url: filepath }],
          aspectRatio: 1,
        },
      };
      render(
        <SelectionCard
          group={group}
          mediaType={mediaType}
          unit={{ one: "sample", many: "samples", temporal: false }}
          {...handlers}
        />,
      );
      expect((await screen.findByTestId("3d-preview")).dataset.nodeId).toBe(
        "episode",
      );
      fireEvent.click(screen.getByRole("button", { name: /^Open / }));
      expect(handlers.open).toHaveBeenCalledWith(group);
      fireEvent.click(screen.getByRole("button", { name: /^Remove / }));
      expect(handlers.remove).toHaveBeenCalledWith("episode");
    },
  );

  it("shows distinct crops for patches that share the same source image", () => {
    const patches: EpisodeSelection[] = [
      {
        ...full,
        episodeId: "left",
        filepath: "/birds.jpg",
        aspectRatio: 2,
        crop: [0.1, 0.2, 0.2, 0.4],
      },
      {
        ...full,
        episodeId: "right",
        filepath: "/birds.jpg",
        aspectRatio: 2,
        crop: [0.5, 0.1, 0.4, 0.2],
      },
    ];
    render(
      <>
        {patches.map((group) => (
          <Card key={group.episodeId} group={group} candidate={null} />
        ))}
      </>,
    );
    const cards = screen.getAllByRole("article");
    const images = cards.map((card) => card.querySelector("img")!);
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "media:///birds.jpg",
      "media:///birds.jpg",
    ]);
    expect(
      images.map((image) => [
        image.style.left,
        image.style.top,
        image.style.width,
        image.style.height,
      ]),
    ).toEqual([
      ["-50%", "-50%", "500%", "250%"],
      ["-125%", "-50%", "250%", "500%"],
    ]);
    expect(cards.map((card) => card.style.width)).toEqual(["106px", "320px"]);
    expect(
      images.map((image) => image.parentElement?.style.aspectRatio),
    ).toEqual(["1", "4"]);
  });

  it("sizes a patch from the loaded image when metadata is missing", () => {
    render(
      <Card
        group={{ ...full, filepath: "/birds.jpg", crop: [0.1, 0.2, 0.2, 0.4] }}
      />,
    );
    const card = screen.getByRole("article");
    const image = card.querySelector("img")!;
    Object.defineProperties(image, {
      naturalWidth: { value: 1600 },
      naturalHeight: { value: 800 },
    });
    fireEvent.load(image);
    expect(image.parentElement?.style.aspectRatio).toBe("1");
    expect(card.style.width).toBe("106px");
  });

  it("keeps ordinary image previews uncropped", () => {
    render(
      <Card group={{ ...full, filepath: "/birds.jpg", aspectRatio: 2 }} />,
    );
    const image = screen.getByRole("article").querySelector("img")!;
    expect(image.getAttribute("style")).toBeNull();
    expect(image.parentElement?.getAttribute("style")).toBeNull();
  });

  it("shows the grouped segment scope and opens the episode from its body", () => {
    render(<Card group={captured} candidate={captured} />);
    expect(screen.getByText("2 segments")).toBeTruthy();
    expect(screen.getByTitle("10–30 frames 60–75 frames")).toBeTruthy();
    expect(screen.queryByText("drive.mp4")).toBeNull();
    expect(screen.queryByText("Matches changed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open drive.mp4" }));
    expect(handlers.open).toHaveBeenCalledWith(
      expect.objectContaining(captured),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove drive.mp4 from selection" }),
    );
    expect(handlers.remove).toHaveBeenCalledWith("episode");
  });

  it("offers replace and add when current matches differ, naming the destination", async () => {
    render(<Card group={captured} candidate={current} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(await screen.findByText("Current matches differ")).toBeTruthy();
    expect(screen.getByText("0–20, 34–50 frames")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add matching segments" });
    expect(add.hasAttribute("disabled")).toBe(false);
    fireEvent.click(add);
    expect(handlers.capture).toHaveBeenCalledWith(current, "add");
    fireEvent.click(screen.getByText("Matches changed"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Replace with 2 matching segments",
      }),
    );
    expect(handlers.capture).toHaveBeenCalledWith(current, "replace");
  });

  it("never accumulates onto or from a full episode", async () => {
    const view = render(<Card group={full} candidate={current} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(
      (
        await screen.findByRole("button", { name: "Add matching segments" })
      ).hasAttribute("disabled"),
    ).toBe(true);
    view.unmount();
    render(<Card group={captured} candidate={full} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(
      await screen.findByRole("button", { name: "Replace with full episode" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Add matching segments" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("distinguishes out-of-results and unavailable episodes while keeping them actionable", () => {
    const view = render(<Card group={captured} candidate={null} />);
    expect(screen.getByText("Not in results")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Open drive.mp4" })
        .hasAttribute("disabled"),
    ).toBe(false);
    view.unmount();
    render(<Card group={{ ...full, unavailable: true }} candidate={null} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Not in results")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "drive.mp4 is unavailable" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove drive.mp4 from selection" }),
    );
    expect(handlers.remove).toHaveBeenCalledWith("episode");
  });

  it("does not flag an episode as outside the results while its match is unknown", () => {
    render(<Card group={captured} />);
    expect(screen.queryByText("Not in results")).toBeNull();
  });

  it("keeps one height and sizes the card from the media aspect ratio", () => {
    const wide = render(
      <Card group={{ ...full, aspectRatio: 16 / 9 }} candidate={full} />,
    );
    expect(screen.getByRole("article").style.width).toBe("188px");
    wide.unmount();
    const tall = render(
      <Card group={{ ...full, aspectRatio: 9 / 16 }} candidate={full} />,
    );
    expect(screen.getByRole("article").style.width).toBe("106px");
    tall.unmount();
    render(<Card group={full} candidate={full} />);
    const article = screen.getByRole("article");
    expect(article.style.width).toBe("208px");
    const image = article.querySelector("video, img") as HTMLVideoElement;
    Object.defineProperty(image, "videoWidth", { value: 1600 });
    Object.defineProperty(image, "videoHeight", { value: 800 });
    fireEvent.loadedMetadata(image);
    expect(article.style.width).toBe("212px");
  });

  it("points the grid at its tile while hovered or focused", () => {
    const tile = document.createElement("div");
    const overlay = document.createElement("div");
    tile.appendChild(overlay);
    registerTile({ id: "episode", overlayEl: overlay, sample: {} });
    const { unmount } = render(<Card group={full} candidate={full} />);
    const article = screen.getByRole("article");
    fireEvent.pointerEnter(article);
    expect(tile.hasAttribute("data-fo-tile-highlight")).toBe(true);
    fireEvent.pointerLeave(article);
    expect(tile.hasAttribute("data-fo-tile-highlight")).toBe(false);
    fireEvent.focus(screen.getByRole("button", { name: "Open drive.mp4" }));
    expect(tile.hasAttribute("data-fo-tile-highlight")).toBe(true);
    unmount();
    expect(tile.hasAttribute("data-fo-tile-highlight")).toBe(false);
    unregisterTile("episode");
  });

  it("mirrors a hovered grid tile", () => {
    render(<Card group={full} candidate={full} />);
    const article = screen.getByRole("article");
    article.scrollIntoView = vi.fn();
    expect(article.hasAttribute("data-mirrored")).toBe(false);
    act(() => setHoveredTile("episode"));
    expect(article.getAttribute("data-mirrored")).toBe("true");
    expect(article.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
    act(() => setHoveredTile("other"));
    expect(article.hasAttribute("data-mirrored")).toBe(false);
    act(() => setHoveredTile(null));
  });

  it("scrolls the grid to its parent and remembers a miss until the results change", async () => {
    const locate = vi.fn(async () => false);
    const view = render(<Card group={full} candidate={full} locate={locate} />);
    const button = screen.getByRole("button", {
      name: "Scroll to drive.mp4 in the grid",
    });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(locate).toHaveBeenCalledWith("episode"));
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
    expect(button.title).toBe("Not in current results");
    view.rerender(
      <Card group={full} candidate={{ ...full }} locate={locate} />,
    );
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("offers no grid scroll for parents outside the results or without a locator", () => {
    const outside = render(
      <Card group={full} candidate={null} locate={vi.fn()} />,
    );
    const button = screen.getByRole("button", {
      name: "Scroll to drive.mp4 in the grid",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.title).toBe("Not in current results");
    outside.unmount();
    render(<Card group={full} candidate={full} />);
    expect(screen.queryByRole("button", { name: /Scroll to/ })).toBeNull();
  });

  it("draws a multimodal sample with the grid's own renderer node", async () => {
    const node = {
      id: "episode",
      sample: { _id: "episode", filepath: "/logs/drive.mcap" },
      urls: [{ field: "filepath", url: "/logs/drive.mcap" }],
      aspectRatio: 1,
    };
    const { container } = render(
      <SelectionCard
        group={{ ...full, filepath: "/logs/drive.mcap", node }}
        candidate={null}
        mediaType="multimodal"
        unit={{ one: "episode", many: "episodes", temporal: true }}
        {...handlers}
      />,
    );
    await waitFor(() =>
      expect(
        container
          .querySelector("[data-grid-tile]")
          ?.getAttribute("data-node-id"),
      ).toBe("episode"),
    );
    expect(
      screen.getByRole("button", { name: "Open drive.mcap" }),
    ).toBeTruthy();
  });
});
