import { buildThumbnailSelectionDetail } from "@fiftyone/looker/src/selection";
import {
  type SampleRendererProps,
  type SampleRendererRenderContext,
} from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@mui/material";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import GridTagBubbles from "./GridTagBubbles";

type GridSampleRendererLookerConfig = {
  createFallbackLooker: () => fos.Lookers;
  pluginName: string;
  Renderer: React.ComponentType<SampleRendererProps>;
  RecoilBridge: React.ComponentType<React.PropsWithChildren>;
  ctx: SampleRendererRenderContext;
  symbol: ID;
};

/** Dimensions as [width, height] in pixels. */
type GridItemDimensions = [width: number, height: number];

/** Error boundary for a sample renderer with fallback behavior. */
class GridSampleRendererErrorBoundary extends React.Component<
  React.PropsWithChildren<{ onError: (error: Error) => void }>,
  { hasError: boolean }
> {
  constructor(
    props: React.PropsWithChildren<{ onError: (error: Error) => void }>
  ) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

// Stylesheet constants for renderer UI
const CONTAINER_STYLES: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const HOST_ELEMENT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden",
};

const OPEN_MODAL_BUTTON_STYLES: React.CSSProperties = {
  position: "absolute",
  right: "8px",
  bottom: "8px",
  width: "22px",
  height: "22px",
  border: "1px solid rgba(255, 255, 255, 0.28)",
  borderRadius: "6px",
  background: "rgba(18, 18, 18, 0.72)",
  color: "#f5f5f5",
  fontSize: "14px",
  lineHeight: "20px",
  textAlign: "center",
  padding: 0,
  cursor: "pointer",
  zIndex: 20,
};

const SELECT_SAMPLE_BUTTON_STYLES: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  color: "hsl(25, 100%, 51%)",
  cursor: "pointer",
  zIndex: 20,
};

// Events that should be forwarded from the built-in fallback renderer.
const FORWARDED_EVENTS = ["load", "refresh", "selectthumbnail"] as const;

type GridLookerOptions = {
  selected?: boolean;
  inSelectionMode?: boolean;
};

type GridSampleRendererWrapperProps = React.PropsWithChildren<{
  selected: boolean;
  onOpenModal: React.MouseEventHandler<HTMLButtonElement>;
  onSelect: React.MouseEventHandler<HTMLButtonElement>;
}>;

const GridSampleRendererWrapper = ({
  children,
  selected,
  onOpenModal,
  onSelect,
}: GridSampleRendererWrapperProps) => {
  const [hovering, setHovering] = React.useState(false);
  const showSelectionControl = hovering || selected;

  return (
    <div
      style={CONTAINER_STYLES}
      onMouseEnter={() => setHovering(true)}
      onMouseMove={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {children}
      {showSelectionControl && (
        <Checkbox
          style={SELECT_SAMPLE_BUTTON_STYLES}
          title={selected ? "Selected" : "Select sample"}
          checked={selected}
          onClick={onSelect}
        />
      )}
      {hovering && (
        <>
          <button
            title="Open sample modal"
            onClick={onOpenModal}
            style={OPEN_MODAL_BUTTON_STYLES}
          >
            ↩
          </button>
        </>
      )}
    </div>
  );
};

/**
 * Spotlight-compatible adapter that mounts a sample renderer directly in grid tiles.
 *
 * Lifecycle:
 * 1. Create instance with config
 * 2. Call attach() to mount the renderer
 * 3. If renderer fails, switchToFallback() activates the built-in renderer
 * 4. Call destroy() to clean up resources
 *
 * Events: Forwards "load", "refresh", and "selectthumbnail" events.
 */
export class GridSampleRendererLooker {
  public loaded = false;

  private readonly eventTarget = new EventTarget();
  private readonly hostElement = document.createElement("div");
  private fallbackLooker: fos.Lookers | null = null;
  private fallbackHandlers = new Map<string, (event: Event) => void>();
  private mountedElement: HTMLElement | null = null;
  private root: Root | null = null;
  private destroyed = false;
  private lastDimensions?: GridItemDimensions;
  private lastFontSize?: number;
  private selected = false;
  private inSelectionMode = false;

  constructor(private readonly config: GridSampleRendererLookerConfig) {
    Object.assign(this.hostElement.style, HOST_ELEMENT_STYLES);
  }

  addEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    this.eventTarget.addEventListener(eventType, handler, options);
  }

  removeEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ) {
    this.eventTarget.removeEventListener(eventType, handler, options);
  }

  private dispatchEvent(eventType: string, detail?: unknown) {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  private forwardFallbackEvent(eventType: string): (event: Event) => void {
    return (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      this.dispatchEvent(eventType, detail);
    };
  }

  private renderPluginRenderer() {
    if (this.fallbackLooker || this.destroyed) {
      return;
    }

    if (!this.root) {
      this.root = createRoot(this.hostElement);
    }

    const { Renderer, ctx, RecoilBridge } = this.config;
    const sample =
      (ctx.sample as { sample?: Record<string, unknown> })?.sample ??
      (ctx.sample as Record<string, unknown>);
    this.root.render(
      <RecoilBridge>
        <GridSampleRendererErrorBoundary
          onError={(error) => this.switchToFallback(error)}
          key={ctx.media.url ?? this.config.pluginName}
        >
          <GridSampleRendererWrapper
            selected={this.selected}
            onOpenModal={this.handleOpenModalClick}
            onSelect={this.handleSelectSampleClick}
          >
            <Renderer ctx={ctx} />
            <GridTagBubbles sample={sample} />
          </GridSampleRendererWrapper>
        </GridSampleRendererErrorBoundary>
      </RecoilBridge>
    );
  }

  private getSelectionPayload(event: React.MouseEvent<HTMLButtonElement>) {
    const sample = (this.config.ctx.sample as { sample?: fos.Sample })?.sample;
    const sampleId =
      sample?.id ?? sample?._id ?? this.config.symbol.description;

    return buildThumbnailSelectionDetail({
      id: sampleId,
      sample,
      symbol: this.config.symbol,
      modifiers: event,
    });
  }

  private handleSelectSampleClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (this.destroyed) {
      return;
    }

    this.selected = !this.selected;
    this.dispatchEvent("selectthumbnail", this.getSelectionPayload(event));
    this.renderPluginRenderer();
  };

  private handleOpenModalClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!this.mountedElement || this.destroyed) {
      return;
    }

    this.mountedElement.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  };

  private switchToFallback(error: Error) {
    if (this.destroyed || this.fallbackLooker) {
      return;
    }

    console.error(
      `Grid sample renderer failed (plugin: ${this.config.pluginName}), ` +
        "falling back to the built-in renderer:",
      error
    );

    this.unmountPluginRenderer();

    try {
      this.fallbackLooker = this.config.createFallbackLooker();
    } catch (fallbackError) {
      console.error(
        `Grid sample renderer: failed to create fallback renderer (plugin: ${this.config.pluginName}):`,
        fallbackError
      );
      this.fallbackLooker = null;
      return;
    }

    // Forward events from the built-in fallback renderer.
    FORWARDED_EVENTS.forEach((eventType) => {
      const handler = this.forwardFallbackEvent(eventType);
      this.fallbackHandlers.set(eventType, handler);
      this.fallbackLooker?.addEventListener(eventType, handler);
    });

    if (this.mountedElement) {
      this.fallbackLooker.attach(
        this.mountedElement,
        this.lastDimensions,
        this.lastFontSize
      );
    }
  }

  attach(
    element: HTMLElement | string,
    dimensions?: GridItemDimensions,
    fontSize?: number
  ) {
    if (this.destroyed) {
      return;
    }

    const resolvedElement =
      typeof element === "string" ? document.getElementById(element) : element;

    if (!resolvedElement) {
      return;
    }

    this.lastDimensions = dimensions;
    this.lastFontSize = fontSize;
    this.mountedElement = resolvedElement;

    if (this.fallbackLooker) {
      this.fallbackLooker.attach(resolvedElement, dimensions, fontSize);
      return;
    }

    if (this.hostElement.parentElement !== resolvedElement) {
      // Replace all children of the target element with the host element.
      // This ensures the renderer has exclusive control of the container.
      resolvedElement.replaceChildren(this.hostElement);
    }

    this.renderPluginRenderer();
    this.loaded = true;
    this.dispatchEvent("load");
  }

  detach() {
    if (this.fallbackLooker) {
      this.fallbackLooker.detach();
      return;
    }

    this.hostElement.remove();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.detach();
    this.unmountPluginRenderer();
    this.removeFallbackHandlers();
    this.fallbackLooker?.destroy();
    this.fallbackLooker = null;
    this.mountedElement = null;
  }

  private removeFallbackHandlers() {
    for (const [eventType, handler] of this.fallbackHandlers) {
      this.fallbackLooker?.removeEventListener(eventType, handler);
    }
    this.fallbackHandlers.clear();
  }

  private unmountPluginRenderer() {
    this.root?.unmount();
    this.root = null;
  }

  /**
   * Delegates to the built-in fallback renderer. No-op if plugin renderer is active.
   */
  updateOptions(options: unknown, disableReload?: boolean) {
    if (!this.fallbackLooker) {
      const { selected: nextSelected, inSelectionMode: nextInSelectionMode } =
        options as GridLookerOptions;

      const shouldRender =
        (typeof nextSelected === "boolean" && this.selected !== nextSelected) ||
        (typeof nextInSelectionMode === "boolean" &&
          this.inSelectionMode !== nextInSelectionMode);

      if (typeof nextSelected === "boolean") {
        this.selected = nextSelected;
      }

      if (typeof nextInSelectionMode === "boolean") {
        this.inSelectionMode = nextInSelectionMode;
      }

      if (shouldRender) {
        this.renderPluginRenderer();
      }

      return;
    }

    this.fallbackLooker?.updateOptions(
      options as Parameters<fos.Lookers["updateOptions"]>[0],
      disableReload
    );
  }

  /**
   * Delegates to the built-in fallback renderer. No-op if plugin renderer is active.
   */
  refreshSample(renderLabels: string[] | null = null) {
    this.fallbackLooker?.refreshSample(renderLabels);
  }

  /**
   * Returns sample overlays from the built-in fallback renderer, or empty array.
   */
  getSampleOverlays() {
    return this.fallbackLooker?.getSampleOverlays() ?? [];
  }

  /**
   * Returns the estimated size from the built-in fallback renderer, or 1.
   */
  getSizeBytesEstimate() {
    return this.fallbackLooker?.getSizeBytesEstimate() ?? 1;
  }
}
