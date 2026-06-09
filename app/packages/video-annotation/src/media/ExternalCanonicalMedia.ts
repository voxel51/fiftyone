import type {
  CanonicalMedia,
  Dimensions,
  Rect,
  Renderer2D,
} from "@fiftyone/lighter";
import { BaseOverlay } from "@fiftyone/lighter/src/overlay/BaseOverlay";

/**
 * Letterbox `original` to fit a `containerW`×`containerH` box while keeping
 * aspect ratio, centering on the constrained axis.
 */
export function letterboxRect(
  original: Dimensions,
  containerW: number,
  containerH: number
): Rect {
  const origAspect = original.width / original.height;
  const targetAspect = containerW / containerH;

  let width: number;
  let height: number;
  let x = 0;
  let y = 0;

  if (origAspect > targetAspect) {
    width = containerW;
    height = containerW / origAspect;
    y = (containerH - height) / 2;
  } else {
    height = containerH;
    width = containerH * origAspect;
    x = (containerW - width) / 2;
  }

  return { x, y, width, height };
}

function makeExternalCanonicalId(): string {
  const suffix = Math.random().toString(36).slice(2, 7);

  return `external-canonical-${Date.now()}-${suffix}`;
}

/**
 * Minimal CanonicalMedia for tiles whose visible pixels come from a
 * non-Lighter element layered behind the canvas — a `<video>` for the
 * native-video tile, an `<img>` for the ImaVid (image-per-frame) tile.
 * Provides coordinate-space bounds (intrinsic media dimensions +
 * container-fitted rendered bounds) so Lighter overlays position
 * correctly, but draws no pixels of its own.
 *
 * We don't use `ImageOverlay` as a stand-in for two reasons:
 *  - It sizes itself from the loaded image's natural dimensions. A
 *    transparent stand-in would collapse every overlay's coordinate
 *    space to whatever 1×1 placeholder we fed it; here we want the
 *    canonical dimensions to be the media's intrinsic resolution.
 *  - `renderImpl` decodes and paints a sprite every frame. We don't
 *    need that — the element behind the canvas is the visible media.
 *
 * The right long-term fix is for `@fiftyone/lighter` to ship a
 * first-class no-pixel canonical of its own.
 */
export class ExternalCanonicalMedia
  extends BaseOverlay
  implements CanonicalMedia
{
  private originalDimensions: Dimensions;
  private currentBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private resizeObserver?: ResizeObserver;
  private detach?: () => void;

  constructor(opts: { width: number; height: number }) {
    super(makeExternalCanonicalId(), "", null as never);

    this.originalDimensions = { width: opts.width, height: opts.height };
  }

  override getOverlayType(): string {
    return "ExternalCanonicalMedia";
  }

  override setRenderer(renderer: Renderer2D): void {
    super.setRenderer(renderer);

    const canvas = renderer.getCanvas();
    const parent = canvas?.parentElement;
    if (!parent) {
      return;
    }

    this.updateBoundsFromContainer(parent.clientWidth, parent.clientHeight);

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      this.updateBoundsFromContainer(width, height);
    });
    this.resizeObserver.observe(parent);

    this.detach = () => {
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
    };
  }

  protected renderImpl(): void {
    // No-op: the element drawn behind the Lighter canvas is the
    // visible media. We exist only to anchor the coordinate system.
  }

  getOriginalDimensions(): Dimensions {
    return this.originalDimensions;
  }

  getRenderedBounds(): Rect {
    return this.currentBounds;
  }

  getAspectRatio(): number {
    const { width, height } = this.originalDimensions;
    return height > 0 ? width / height : 1;
  }

  updateBounds(): void {
    if (!this.renderer) {
      return;
    }

    const parent = this.renderer.getCanvas()?.parentElement;
    if (!parent) {
      return;
    }

    this.updateBoundsFromContainer(parent.clientWidth, parent.clientHeight);
  }

  private updateBoundsFromContainer(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    this.currentBounds = letterboxRect(this.originalDimensions, width, height);
    this.markDirty();

    // Tell Scene2D to update its coordinate-system transform. Without this
    // event the coord system stays at the default identity and overlays
    // collapse to (0,0) — relativeToAbsolute([0..1]) returns ~0.
    this.eventBus.dispatch("lighter:canonical-media-bounds-changed", {
      bounds: this.currentBounds,
    });
  }

  /** Caller cleanup (also runs on Scene2D.removeOverlay -> overlay.destroy). */
  override destroy(): void {
    this.detach?.();
  }
}
