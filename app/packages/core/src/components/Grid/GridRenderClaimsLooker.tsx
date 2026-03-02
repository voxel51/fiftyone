import { RenderClaimsContext } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

type GridRendererProps = {
  ctx: RenderClaimsContext;
  url: string;
};

type GridRenderClaimsLookerConfig = {
  createFallbackLooker: () => fos.Lookers;
  pluginName: string;
  Renderer: React.ComponentType<GridRendererProps>;
  RecoilBridge: React.ComponentType<React.PropsWithChildren>;
  ctx: RenderClaimsContext;
  url: string;
};

/** Dimensions as [width, height] in pixels. */
type GridItemDimensions = [width: number, height: number];

/** Error boundary for render-claims renderer with fallback behavior. */
class GridRenderClaimsErrorBoundary extends React.Component<
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

// Looker events that should be forwarded from fallback looker
const FORWARDED_EVENTS = ["load", "refresh", "selectthumbnail"] as const;

/**
 * Spotlight-compatible looker adapter that mounts a claim-based React renderer for plugins.
 *
 * Lifecycle:
 * 1. Create instance with config
 * 2. Call attach() to mount the renderer
 * 3. If renderer fails, switchToFallback() activates the default looker
 * 4. Call destroy() to clean up resources
 *
 * Events: Forwards "load", "refresh", and "selectthumbnail" events.
 */
export class GridRenderClaimsLooker {
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

  constructor(private readonly config: GridRenderClaimsLookerConfig) {
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

  private mountPluginRenderer() {
    if (this.root || this.fallbackLooker || this.destroyed) {
      return;
    }

    const { Renderer, ctx, url, RecoilBridge } = this.config;
    this.root = createRoot(this.hostElement);
    this.root.render(
      <RecoilBridge>
        <GridRenderClaimsErrorBoundary
          onError={(error) => this.switchToFallback(error)}
          key={url}
        >
          <div style={CONTAINER_STYLES}>
            <Renderer ctx={ctx} url={url} />
            <button
              aria-label="Open sample modal"
              title="Open sample modal"
              onClick={this.handleOpenModalClick}
              style={OPEN_MODAL_BUTTON_STYLES}
            >
              ↩
            </button>
          </div>
        </GridRenderClaimsErrorBoundary>
      </RecoilBridge>
    );
  }

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
      `Grid renderClaims renderer failed (plugin: ${this.config.pluginName}), ` +
        "falling back to default looker:",
      error
    );

    this.unmountPluginRenderer();

    try {
      this.fallbackLooker = this.config.createFallbackLooker();
    } catch (fallbackError) {
      console.error(
        `Grid renderClaims: failed to create fallback looker (plugin: ${this.config.pluginName}):`,
        fallbackError
      );
      this.fallbackLooker = null;
      return;
    }

    // Forward events from fallback looker
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

    this.mountPluginRenderer();
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
   * Delegates to fallback looker. No-op if plugin renderer is active.
   */
  updateOptions(options: unknown, disableReload?: boolean) {
    this.fallbackLooker?.updateOptions(
      options as Parameters<fos.Lookers["updateOptions"]>[0],
      disableReload
    );
  }

  /**
   * Delegates to fallback looker. No-op if plugin renderer is active.
   */
  refreshSample(renderLabels: string[] | null = null) {
    this.fallbackLooker?.refreshSample(renderLabels);
  }

  /**
   * Returns sample overlays from fallback looker, or empty array if not available.
   */
  getSampleOverlays() {
    return this.fallbackLooker?.getSampleOverlays() ?? [];
  }

  /**
   * Returns estimated size in bytes from fallback looker, or 1 if not available.
   */
  getSizeBytesEstimate() {
    return this.fallbackLooker?.getSizeBytesEstimate() ?? 1;
  }
}
