// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HoverCard, { type HoverContent } from "./HoverCard";

afterEach(cleanup);

const CONTENT: HoverContent = {
  hit: { index: 3, id: "s3", label: "", x: 10, y: 20 },
  src: null,
  value: null,
  filename: "frame.png",
  header: { title: "camera_front" },
};

/** A stand-in for the plot canvas, which stops its own pointer events in the
 * capture phase the way the lasso overlay does */
function renderCard(
  onClose?: () => void,
  action?: { label: string; run: () => void; loading?: boolean },
) {
  const plotDown = vi.fn();
  render(
    <div
      className="emb-plot"
      data-testid="plot"
      onPointerDownCapture={(e) => {
        e.stopPropagation();
        plotDown();
      }}
    >
      <HoverCard
        content={CONTENT}
        origin={{ left: 0, top: 0 }}
        onClose={onClose}
        action={action}
      />
    </div>,
  );
  return { plotDown };
}

/** jsdom has no PointerEvent, and fireEvent drops clientX/clientY without it
 * -- dispatched as a MouseEvent the coordinates survive, which is the whole
 * point of these cases */
function press(target: Element, type: string, x: number, y: number) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
  );
}

/** One press that does not move, i.e. a click rather than a drag */
function click(target: Element, x = 8, y = 8) {
  press(target, "pointerdown", x, y);
  press(target, "pointerup", x, y);
}

describe("HoverCard", () => {
  it("closes a pinned card when the plot is clicked elsewhere", () => {
    const onClose = vi.fn();
    const { plotDown } = renderCard(onClose);

    click(screen.getByTestId("plot"));

    expect(onClose).toHaveBeenCalledTimes(1);
    // The dismissing click still reaches what it was aimed at
    expect(plotDown).toHaveBeenCalledTimes(1);
  });

  it("keeps a pinned card when the press becomes a drag", () => {
    const onClose = vi.fn();
    renderCard(onClose);

    // A pan or a lasso starts exactly like a dismissing click; only the
    // distance travelled by the time the pointer lifts tells them apart
    const plot = screen.getByTestId("plot");
    press(plot, "pointerdown", 8, 8);
    press(plot, "pointerup", 80, 60);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a pinned card when the click lands outside the plot", () => {
    const onClose = vi.fn();
    renderCard(onClose);

    // Pinning is how the reader keeps the card while they work in the rest
    // of the App, so the view bar and the sidebar must not take it away
    click(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a pinned card when the click lands on the card", () => {
    const onClose = vi.fn();
    renderCard(onClose);

    click(screen.getByText("camera_front"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops closing once the card is gone", () => {
    const onClose = vi.fn();
    const { plotDown } = renderCard(onClose);
    cleanup();

    click(screen.queryByTestId("plot") ?? document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(plotDown).not.toHaveBeenCalled();
  });

  it("spins the action's own button while it runs", () => {
    // The reader clicked that button and is looking at it; a notice elsewhere
    // on the plot is not where they would find out
    const run = vi.fn();
    renderCard(undefined, { label: "Find similar", run, loading: true });

    const button = screen.getByRole("button", { name: /find similar/i });
    expect(button.querySelector(".animate-spin")).toBeTruthy();
    // A second search is not another question — the first has not answered
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("offers the action again once it has answered", () => {
    const run = vi.fn();
    renderCard(undefined, { label: "Find similar", run, loading: false });

    const button = screen.getByRole("button", { name: /find similar/i });
    expect(button.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(button);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves an unpinned card to the pointer", () => {
    renderCard(undefined);

    fireEvent.pointerDown(document.body);

    expect(screen.getByText("frame.png")).toBeTruthy();
  });
});

describe("HoverCard: patch crop", () => {
  /** jsdom never loads images, so the card's preload would never settle.
   * This stand-in settles at a fixed natural size the moment it is given a
   * source, unless the test is holding loads back. */
  let holdLoads = false;
  class InstantImage {
    naturalWidth = 600;
    naturalHeight = 400;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private current = "";
    get src() {
      return this.current;
    }
    set src(value: string) {
      this.current = value;
      if (!holdLoads) this.onload?.();
    }
  }

  beforeEach(() => {
    holdLoads = false;
    vi.stubGlobal("Image", InstantImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ORIGIN = { left: 0, top: 0 };
  const PATCH: HoverContent = {
    hit: { index: 3, id: "label3", label: "", x: 10, y: 20 },
    src: "https://media/img.jpg",
    value: null,
    filename: "img.jpg",
    bounds: [0.1, 0.2, 0.5, 0.25],
  };
  const crop = () => document.querySelector("svg.emb-hover-crop");

  it("crops to the patch, clipped to it", () => {
    render(<HoverCard content={PATCH} origin={ORIGIN} />);

    const svg = crop();
    // The patch in the image's own pixels: 600x400 source
    expect(svg?.getAttribute("viewBox")).toBe("60 80 300 100");
    // The clip is the crop's other half: without it, `meet` fills the
    // letterbox with neighbouring image instead of card surface
    const clipId = svg?.querySelector("clipPath")?.id;
    expect(clipId).toBeTruthy();
    expect(svg?.querySelector("image")?.getAttribute("clip-path")).toBe(
      `url(#${clipId})`,
    );
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows the whole image for a sample-level point", () => {
    render(<HoverCard content={{ ...PATCH, bounds: null }} origin={ORIGIN} />);

    expect(crop()).toBeNull();
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "https://media/img.jpg",
    );
  });

  it("shows nothing for a new image until its own preload settles", () => {
    const { rerender } = render(<HoverCard content={PATCH} origin={ORIGIN} />);
    expect(crop()).not.toBeNull();

    holdLoads = true;
    rerender(
      <HoverCard
        content={{ ...PATCH, src: "https://media/other.jpg" }}
        origin={ORIGIN}
      />,
    );

    // The settled size belongs to the first image; cropping the second
    // with it would frame the wrong region
    expect(crop()).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });
});
