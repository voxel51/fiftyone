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

type GridCustomRendererItemConfig = {
  pluginName: string;
  Renderer: React.ComponentType<SampleRendererProps>;
  RecoilBridge: React.ComponentType<React.PropsWithChildren>;
  ctx: SampleRendererRenderContext;
  symbol: ID;
};

/** Dimensions as [width, height] in pixels. */
type GridItemDimensions = [width: number, height: number];

/** Error boundary for a sample renderer with fallback behavior. */
class GridCustomRendererErrorBoundary extends React.Component<
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
    // Defer the fail-open handoff so React can finish the failed render before
    // we tear down the dedicated plugin root.
    queueMicrotask(() => this.props.onError(error));
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

type GridItemOptions = {
  selected?: boolean;
  inSelectionMode?: boolean;
};

type GridCustomRendererWrapperProps = React.PropsWithChildren<{
  selected: boolean;
  onOpenModal: React.MouseEventHandler<HTMLButtonElement>;
  onSelect: React.MouseEventHandler<HTMLButtonElement>;
}>;

const GridCustomRendererWrapper = ({
  children,
  selected,
  onOpenModal,
  onSelect,
}: GridCustomRendererWrapperProps) => {
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
 * 3. If renderer fails, mark the dataset fail-open and wait for the grid to
 *    rebuild with the built-in renderer on the next pass
 * 4. Call destroy() to clean up resources
 *
 * Events: Forwards "load" and "selectthumbnail" events.
 */
export class GridCustomRendererItem {
  public loaded = false;

  private readonly eventTarget = new EventTarget();
  private readonly hostElement = document.createElement("div");
  private mountedElement: HTMLElement | null = null;
  private pluginRoot: Root | null = null;
  private pluginFailed = false;
  private destroyed = false;
  private selected = false;
  private inSelectionMode = false;

  constructor(private readonly config: GridCustomRendererItemConfig) {
    Object.assign(this.hostElement.style, HOST_ELEMENT_STYLES);
    this.pluginFailed = fos.isGridCustomRendererFailOpen(
      this.config.ctx.dataset.name
    );
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

  private isDatasetFailOpen() {
    return fos.isGridCustomRendererFailOpen(this.config.ctx.dataset.name);
  }

  private renderPluginRenderer() {
    if (this.isDatasetFailOpen()) {
      this.pluginFailed = true;
    }

    if (this.destroyed || this.pluginFailed) {
      return;
    }

    const { Renderer, ctx, RecoilBridge } = this.config;
    const sample =
      (ctx.sample as { sample?: Record<string, unknown> })?.sample ??
      (ctx.sample as Record<string, unknown>);

    if (!this.pluginRoot) {
      this.pluginRoot = createRoot(this.hostElement);
    }

    this.pluginRoot.render(
      <RecoilBridge>
        <GridCustomRendererErrorBoundary
          onError={(error) => this.switchToFallback(error)}
          key={ctx.media.url ?? this.config.pluginName}
        >
          <GridCustomRendererWrapper
            selected={this.selected}
            onOpenModal={this.handleOpenModalClick}
            onSelect={this.handleSelectSampleClick}
          >
            <Renderer ctx={ctx} />
            <GridTagBubbles sample={sample} />
          </GridCustomRendererWrapper>
        </GridCustomRendererErrorBoundary>
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
    if (this.destroyed || this.pluginFailed) {
      return;
    }

    console.error(
      `Grid sample renderer failed (plugin: ${this.config.pluginName}), ` +
        "disabling custom grid renderers for this dataset for the rest of this browser session:",
      error
    );

    this.pluginFailed = true;

    fos.markGridCustomRendererFailed({
      datasetName: this.config.ctx.dataset.name,
      rendererName: this.config.pluginName,
      errorMessage: error.message,
    });

    setTimeout(() => {
      if (!this.destroyed) {
        this.unmountPluginRenderer();
      }
    }, 0);
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

    this.mountedElement = resolvedElement;

    if (this.hostElement.parentElement !== resolvedElement) {
      // Replace all children of the target element with the host element.
      resolvedElement.replaceChildren(this.hostElement);
    }

    this.renderPluginRenderer();
    this.loaded = true;
    this.dispatchEvent("load");
  }

  detach() {
    this.hostElement.remove();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.detach();
    this.unmountPluginRenderer();
    this.pluginFailed = false;
    this.mountedElement = null;
    this.hostElement.remove();
  }

  private unmountPluginRenderer() {
    this.pluginRoot?.unmount();
    this.pluginRoot = null;
  }

  updateOptions(options: unknown, disableReload?: boolean) {
    void disableReload;

    const { selected: nextSelected, inSelectionMode: nextInSelectionMode } =
      options as GridItemOptions;

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
  }

  refreshSample(renderLabels: string[] | null = null) {
    void renderLabels;
  }

  getSampleOverlays() {
    return [];
  }

  getSizeBytesEstimate() {
    return 1;
  }
}
