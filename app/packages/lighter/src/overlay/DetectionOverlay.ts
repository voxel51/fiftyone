/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  EDGE_THRESHOLD,
  HANDLE_OFFSET_X,
  HANDLE_OFFSET_Y,
  HOVERED_DASH_LENGTH,
  LABEL_ARCHETYPE_PRIORITY,
  ROTATE_HANDLE_OFFSET,
  ROTATE_HANDLE_RADIUS,
  ROTATION_SNAP,
  SELECTED_DASH_LENGTH,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/Scene2D";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  RenderMeta,
  Rotatable,
  Spatial,
} from "../types";
import { parseColorWithAlpha } from "../utils/color";
import {
  getInstanceStrokeStyles,
  getSimpleStrokeStyles,
} from "../utils/colorMapping";
import {
  SegmentationTool,
  type SegmentationToolState,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { OverlayEvent } from "../interaction/InteractionManager";
import { distanceFromLineSegment } from "../utils/geometry";
import { BaseOverlay } from "./BaseOverlay";
import { MaskCanvas } from "./MaskCanvas";
import type { MaskSnapshot, PaintStrokeData } from "./MaskCanvas";
import { MaskKeypoints } from "./MaskKeypoints";
import type { SerializedMask } from "@fiftyone/utilities";
import {
  getRotatedBoxCorners,
  getRotation2d,
  isPointInRotatedBox,
  toRotatedBoxFrame,
} from "@fiftyone/utilities";
import { BASE_ALPHA } from "@fiftyone/looker/src/constants";
import type { OverlayMask } from "@fiftyone/looker/src/numpy";

export type DetectionLabel = RawLookerLabel & {
  label: string;
  bounding_box: number[];
  confidence?: number;
  mask?: SerializedMask;
  mask_path?: string;
  /**
   * 2D boxes: radians, applied around the box center, positive is clockwise
   * on screen. 3D boxes carry an `[x, y, z]` list here instead, which this
   * surface ignores.
   */
  rotation?: number | number[];
};

/**
 * Options for creating a bounding box overlay.
 */
export interface DetectionOverlayOptions {
  id: string;
  // Relative bounds [0,1]
  relativeBounds?: Rect;
  label: DetectionLabel;
  field: string;
  draggable?: boolean;
  resizeable?: boolean;
  selectable?: boolean;
  /**
   * A mask decoded out-of-band — typically from `label.mask_path` — that
   * seeds the editing canvas without touching `label.mask`. When set, this
   * takes precedence over `label.mask` for the initial mask source.
   */
  preDecodedMask?: OverlayMask;
}

export type ResizeRegion =
  | "RESIZE_N"
  | "RESIZE_NE"
  | "RESIZE_E"
  | "RESIZE_SE"
  | "RESIZE_S"
  | "RESIZE_SW"
  | "RESIZE_W"
  | "RESIZE_NW";

export type InteractionState =
  | ResizeRegion
  | "NONE"
  | "DRAGGING"
  | "ROTATING"
  | "SETTING"
  | "PAINTING";

export const NO_BOUNDS = { x: NaN, y: NaN, width: NaN, height: NaN };

// PointerEvent: `event.buttons === 1` -> left mouse button depressed
const LEFT_MOUSE_BUTTON = 1;

/**
 * Bounding box overlay implementation with drag support, selection, and spatial coordinates.
 */
export class DetectionOverlay
  extends BaseOverlay<DetectionLabel>
  implements Selectable, Spatial, Hoverable, Rotatable
{
  private isDraggable: boolean;
  private isResizeable: boolean;
  private interactionState: InteractionState = "NONE";
  private moveStartPoint?: Point;
  private moveStartPosition?: Point;
  private moveStartBounds?: Rect;
  private moveStartRotation?: number;
  /** Pointer angle minus box rotation at rotate-grab time, in radians */
  private rotateGrabOffset = 0;
  private isSelectedState = false;
  private isBeingEstablished = false;

  #relativeBounds: Rect;
  #rotation = 0;

  private textBounds?: Rect;

  private mask?: MaskCanvas;
  /**
   * The mask source picked at construction time — inline `SerializedMask`
   * if present, otherwise a pre-decoded `OverlayMask` from `mask_path`.
   * Retained so {@link rehydrateMask} can reseed `MaskCanvas` after a
   * destroy/re-add cycle (e.g. undoing a deletion) without depending on
   * `label.mask`, which is `undefined` for `mask_path`-sourced overlays.
   */
  private maskSource?: SerializedMask | OverlayMask;
  private segmentationTool?: SegmentationToolState;

  // Pen tool state
  private maskKeypoints?: MaskKeypoints;

  public cursor = "pointer";

  constructor(options: DetectionOverlayOptions) {
    super(options.id, options.field, options.label);

    this.isDraggable = options.draggable !== false;
    this.isResizeable = options.resizeable !== false;
    this.#relativeBounds = options.relativeBounds || NO_BOUNDS;
    this.#rotation = getRotation2d(options.label.rotation);

    this.maskSource = options.preDecodedMask ?? this.label.mask;
    if (this.maskSource) {
      this.mask = new MaskCanvas(this.maskSource);
    } else if (this.label.mask_path) {
      // `mask_path` was present on the label but the caller didn't supply
      // a decoded source (e.g. the URL couldn't be resolved). Construct an
      // empty placeholder so `hasMask()` correctly reports "yes" — without
      // it, the save flow would treat the missing canvas as a user
      // deletion and wipe the mask_path on the backend.
      this.mask = new MaskCanvas();
    }
  }

  getOverlayType(): string {
    return "DetectionOverlay";
  }

  applyLabel(label: DetectionLabel) {
    super.applyLabel(label);

    // A reproject (e.g. the autosave tick's server-echo reconcile) must not
    // clobber an overlay whose gesture is still in flight: the live bounds and
    // mask canvas are the source of truth until the gesture commits on
    // pointer-up. Overwriting #relativeBounds mid-paint/resize reverts to the
    // old committed box, and onPointerUp's paintEnd(this.bounds) then bakes the
    // mask against those stale bounds — the reported squash. (Painting outside
    // the box auto-expands it, so the live box is legitimately wider than the
    // committed one.) Base label metadata is already synced via super above.
    if (this.isInteracting()) {
      return;
    }

    if (label.bounding_box) {
      const [x, y, w, h] = label.bounding_box;
      this.#relativeBounds = { x, y, width: w, height: h };
      this.markDirty();
      this.eventBus.dispatch("lighter:overlay-bounds-changed", {
        id: this.id,
        bounds: this.bounds,
      });
    }

    const rotation = getRotation2d(label.rotation);
    if (rotation !== this.#rotation) {
      this.#rotation = rotation;
      this.markDirty();
    }

    if (label.mask) {
      // Inline mask takes precedence over any `mask_path`-sourced
      // `OverlayMask` we may have been carrying.
      this.maskSource = label.mask;
      if (this.mask) {
        this.mask.updateSource(label.mask);
      } else {
        this.mask = new MaskCanvas(label.mask);
      }
      this.markDirty();
    } else if (
      (label.mask === null || !label.mask_path) &&
      !this.mask?.hasPendingEncode()
    ) {
      // Drop a stale mask when the label carries neither inline `mask` data nor
      // a `mask_path` to decode — an explicit removal (`null`), or reconciling
      // this overlay onto a label with no mask at all (e.g. a video track's
      // mask-less frame as the playhead advances past the mask's keyframe).
      // A pending `mask_path` decode (mask `undefined`, `mask_path` set) is left
      // alone so the in-flight decode still lands.
      //
      // EXCEPTION: a freshly-painted mask whose async encode is still in flight.
      // A reproject here (e.g. a video auto-extend / keyframe-promotion write
      // that lands before the encode resolves) carries the COMMITTED, still
      // mask-less value — stale relative to the local paint. Destroying the
      // MaskCanvas would abort the encode (it bails on canvas-swap), so the mask
      // would be lost and never reach the engine. Keep it; the encode's
      // re-commit carries it across.
      const hadMask = !!this.mask;
      this.maskSource = undefined;
      this.mask?.destroy();
      this.mask = undefined;
      if (hadMask) this.markDirty();
    }
  }

  updateLabel(label: DetectionLabel) {
    this.applyLabel(label);

    this.eventBus.dispatch("lighter:overlay-commit-requested", {
      id: this.id,
      overlayId: this.id,
      label,
      hasMask: !!this.mask,
    });
  }

  getPosition() {
    const { x, y } = this.bounds;
    return {
      x,
      y,
    };
  }

  get bounds(): Rect {
    const bounds = this.relativeBounds;
    return this.getCoordinateSystem().relativeToAbsolute(bounds);
  }

  set bounds(bounds: Rect | undefined) {
    this.markDirty();
    if (!bounds) {
      this.#relativeBounds = NO_BOUNDS;
      return;
    }

    const relative = this.getCoordinateSystem().absoluteToRelative(bounds);
    this.#relativeBounds = relative;
    this.eventBus.dispatch("lighter:overlay-bounds-changed", {
      id: this.id,
      bounds: this.bounds,
    });
  }

  get relativeBounds(): Rect {
    return this.#relativeBounds;
  }

  set relativeBounds(bounds: Rect | undefined) {
    this.#relativeBounds = bounds ? { ...bounds } : NO_BOUNDS;
    this.markDirty();
  }

  get containerId() {
    return this.id;
  }

  override setRenderer(renderer: Renderer2D): void {
    super.setRenderer(renderer);
    this.maskKeypoints?.setRenderer(renderer);
  }

  protected renderImpl(renderer: Renderer2D, renderMeta: RenderMeta): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.currentStyle;

    if (!style) return;

    const maskColor = style.strokeStyle || style.fillStyle || "#ffffff";
    const isEditingMask =
      this.isSelected() && (this.hasMask() || this.maskKeypoints);

    this.mask?.render(
      renderer,
      this.bounds,
      this.containerId,
      maskColor,
      isEditingMask ? 0.7 : (style.opacity ?? BASE_ALPHA),
      () => {
        this.markDirty();
      },
    );

    // lightweight border when editing detection mask
    if (isEditingMask) {
      renderer.drawScrim(
        this.bounds,
        renderMeta.canonicalMediaBounds,
        this.containerId,
      );

      renderer.drawRect(
        this.bounds,
        {
          strokeStyle: style.strokeStyle || "#ffffff",
          lineWidth: 1,
          dashPattern: [4, 4],
        },
        this.containerId,
      );

      this.maskKeypoints?.render(renderer, style, renderMeta);

      this.emitLoaded();
      return;
    }

    // Check if this label has an instance to determine stroke styling
    const hasInstance = this.label?.instance?._id !== undefined;

    // Get stroke styles based on whether the label has an instance
    const { strokeColor, overlayStrokeColor, overlayDash, hoverStrokeColor } =
      hasInstance
        ? getInstanceStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#000000",
            isHovered: this.isHoveredState,
            dashLength: 8,
          })
        : getSimpleStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#ffffff",
            isHovered: this.isHoveredState,
            dashLength: this.isSelectedState
              ? SELECTED_DASH_LENGTH
              : HOVERED_DASH_LENGTH,
          });

    const mainStrokeStyle = {
      ...style,
      strokeStyle: strokeColor,
      isSelected: this.isSelectedState,
    };

    delete mainStrokeStyle.dashPattern;

    const rotation = this.getRotation() || undefined;

    // Hide bbox stroke by default when mask is present (only show on selection/hover)
    if (!this.hasMask() || this.isSelectedState || this.isHoveredState) {
      renderer.drawRect(
        this.bounds,
        mainStrokeStyle,
        this.containerId,
        rotation,
      );
    }

    if (hoverStrokeColor) {
      renderer.drawRect(
        this.bounds,
        {
          strokeStyle: hoverStrokeColor,
          lineWidth: style.lineWidth || STROKE_WIDTH,
        },
        this.containerId,
        rotation,
      );
    } else if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        this.bounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: style.lineWidth,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId,
        rotation,
      );
    }

    if (
      this.isSelected() &&
      style.strokeStyle &&
      (this.isDraggable || this.isResizeable)
    ) {
      const colorObj = parseColorWithAlpha(style.strokeStyle);
      const color = colorObj.color;
      renderer.drawScrim(
        this.bounds,
        renderMeta.canonicalMediaBounds,
        this.containerId,
        rotation,
      );
      renderer.drawHandles(
        this.bounds,
        style.lineWidth || STROKE_WIDTH,
        color,
        this.containerId,
        rotation,
      );

      if (this.canRotate()) {
        this.drawRotateHandle(renderer, style.strokeStyle);
      }
    }

    const showLabel = !this.hasMask() || hoverStrokeColor || overlayStrokeColor;

    if (this.label && this.label.label?.length > 0 && showLabel) {
      const offset = style.lineWidth
        ? style.lineWidth / renderer.getScale() / 2
        : 0;

      // the header stays unrotated, anchored to the STORED box's top-left —
      // a stationary point while the box rotates under it
      const labelPosition = this.isSelected()
        ? {
            x: this.bounds.x + offset * HANDLE_OFFSET_X,
            y: this.bounds.y - offset * HANDLE_OFFSET_Y,
          }
        : {
            x: this.bounds.x - offset,
            y: this.bounds.y - offset,
          };

      let textToDraw = this.label?.label;

      if (
        typeof this.label?.confidence !== "undefined" &&
        !isNaN(this.label?.confidence)
      ) {
        textToDraw += ` (${this.label?.confidence.toFixed(2)})`;
      }

      // Draw text and store the dimensions for accurate header detection
      this.textBounds = renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId,
      );
    }

    this.emitLoaded();
  }

  /** Draws the rotate handle: a stem from the top edge midpoint to a knob. */
  private drawRotateHandle(renderer: Renderer2D, strokeStyle: string): void {
    const scale = renderer.getScale();
    const knobCenter = this.getRotateHandleCenter(scale);

    // top edge midpoint, rotated with the box
    const { x, y, width, height } = this.bounds;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const dy = y - cy;
    const rotation = this.getRotation();
    const topMid = {
      x: cx - dy * Math.sin(rotation),
      y: cy + dy * Math.cos(rotation),
    };

    renderer.drawLine(
      topMid,
      knobCenter,
      { strokeStyle, lineWidth: 1 },
      this.containerId,
    );
    renderer.drawPoint(
      knobCenter,
      ROTATE_HANDLE_RADIUS / scale,
      { fillStyle: strokeStyle, strokeStyle: "#ffffff", lineWidth: 1 },
      this.containerId,
    );
  }

  getMoveStartPosition(): Point | undefined {
    return this.moveStartPosition;
  }

  getMoveStartBounds(): Rect | undefined {
    return this.moveStartBounds;
  }

  getInteractionState() {
    return this.interactionState;
  }

  isInteracting() {
    return this.interactionState !== "NONE";
  }

  isDragging() {
    return this.interactionState === "DRAGGING";
  }

  isResizing() {
    return this.interactionState.startsWith("RESIZE_");
  }

  isRotating() {
    return this.interactionState === "ROTATING";
  }

  /**
   * The rendered 2D rotation, in radians. `0` for masked detections —
   * instance masks are stored relative to the axis-aligned box, so rotation
   * is ignored when a mask is present.
   */
  getRotation(): number {
    if (this.hasMask() || this.maskKeypoints) {
      return 0;
    }

    return this.#rotation;
  }

  /** Sets the rotation, normalized into `[0, 2*pi)`. */
  setRotation(rotation: number): void {
    const TWO_PI = 2 * Math.PI;
    const normalized = ((rotation % TWO_PI) + TWO_PI) % TWO_PI;

    if (normalized !== this.#rotation) {
      this.#rotation = normalized;
      this.markDirty();
    }
  }

  getMoveStartRotation(): number | undefined {
    return this.moveStartRotation;
  }

  /** Whether the rotate handle is active for this overlay. */
  private canRotate(): boolean {
    return (
      this.isResizeable &&
      !this.hasMask() &&
      !this.maskKeypoints &&
      this.hasValidBounds()
    );
  }

  /** The rotated box's world-space corners (TL, TR, BR, BL when unrotated). */
  private getWorldCorners(): [Point, Point, Point, Point] {
    const { x, y, width, height } = this.bounds;
    const corners = getRotatedBoxCorners(
      [x, y, width, height],
      this.getRotation(),
      // bounds are already world-space pixels; unit dimensions apply the
      // rotation in that same space
      [1, 1],
    );

    return corners.map(([cx, cy]) => ({ x: cx, y: cy })) as [
      Point,
      Point,
      Point,
      Point,
    ];
  }

  /** World-space center of the rotate handle knob. */
  private getRotateHandleCenter(scale: number): Point {
    const { x, y, width, height } = this.bounds;
    const cx = x + width / 2;
    const cy = y + height / 2;

    // unrotated: centered above the top edge; rotate with the box
    const dy = y - ROTATE_HANDLE_OFFSET / scale - cy;
    const rotation = this.getRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    return { x: cx - dy * sin, y: cy + dy * cos };
  }

  private isOnRotateHandle(worldPoint: Point, scale: number): boolean {
    if (!this.isSelected() || !this.canRotate()) {
      return false;
    }

    const center = this.getRotateHandleCenter(scale);
    // 2x the drawn radius for a forgiving grab target
    const hitRadius = (2 * ROTATE_HANDLE_RADIUS) / scale;

    return (
      Math.hypot(worldPoint.x - center.x, worldPoint.y - center.y) <= hitRadius
    );
  }

  isSetting() {
    return this.interactionState === "SETTING";
  }

  isPainting() {
    return this.interactionState === "PAINTING";
  }

  private getResizeRegion(
    worldPoint: Point,
    scale: number,
  ): ResizeRegion | null {
    const { x, y, height, width } = this.bounds;

    // test in the box's local frame so edges follow the rotation; for an
    // unrotated box this reduces to the plain world-space comparison
    const [lx, ly] = toRotatedBoxFrame(
      [worldPoint.x, worldPoint.y],
      [x, y, width, height],
      this.getRotation(),
      [1, 1],
    );

    const isNorth = ly <= -height / 2 + EDGE_THRESHOLD / scale;
    const isEast = lx >= width / 2 - EDGE_THRESHOLD / scale;
    const isSouth = ly >= height / 2 - EDGE_THRESHOLD / scale;
    const isWest = lx <= -width / 2 + EDGE_THRESHOLD / scale;

    return isNorth && isWest
      ? "RESIZE_NW"
      : isNorth && isEast
        ? "RESIZE_NE"
        : isNorth
          ? "RESIZE_N"
          : isSouth && isWest
            ? "RESIZE_SW"
            : isSouth && isEast
              ? "RESIZE_SE"
              : isSouth
                ? "RESIZE_S"
                : isWest
                  ? "RESIZE_W"
                  : isEast
                    ? "RESIZE_E"
                    : null;
  }

  getCursor(worldPoint: Point, scale: number): string {
    if (!this.hasValidBounds()) return "crosshair";
    if (this.isPaintingActive()) return "crosshair";
    if (!this.isSelected()) return "pointer";
    if (this.hasMask()) return "default";

    if (!this.isDraggable && !this.isResizeable) {
      return "default";
    }

    if (this.isOnRotateHandle(worldPoint, scale)) {
      return this.isRotating() ? "grabbing" : "grab";
    }

    const resizeRegion = this.getResizeRegion(worldPoint, scale);

    if (!resizeRegion) {
      return this.isDraggable
        ? this.moveStartPoint
          ? "grabbing"
          : "grab"
        : "default";
    }

    if (!this.isResizeable) {
      return "default";
    }

    return DetectionOverlay.resizeCursor(resizeRegion, this.getRotation());
  }

  /**
   * The resize cursor for a region, oriented to the region's VISUAL drag
   * axis: the local axis rotated by the box's rotation, bucketed to the
   * nearest of the four bidirectional resize cursors.
   */
  private static resizeCursor(region: ResizeRegion, rotation: number): string {
    // drag-axis angle of each region on an unrotated box, in degrees
    const base: Record<ResizeRegion, number> = {
      RESIZE_E: 0,
      RESIZE_W: 0,
      RESIZE_SE: 45,
      RESIZE_NW: 45,
      RESIZE_N: 90,
      RESIZE_S: 90,
      RESIZE_NE: 135,
      RESIZE_SW: 135,
    };

    const degrees = (rotation * 180) / Math.PI;
    // bidirectional axis: bucket into [0, 180) at 45-degree resolution
    const axis =
      (((Math.round((base[region] + degrees) / 45) * 45) % 180) + 180) % 180;

    switch (axis) {
      case 0:
        return "ew-resize";
      case 45:
        return "nwse-resize";
      case 90:
        return "ns-resize";
      default:
        return "nesw-resize";
    }
  }

  // Interaction handlers
  onPointerDown({
    point,
    worldPoint,
    scale,
    segmentationToolState,
  }: OverlayEvent): boolean {
    this.segmentationTool = segmentationToolState;
    this.isBeingEstablished = !this.hasValidBounds();

    // Segmentation painting takes priority over drag/resize
    if (this.isPaintingActive()) {
      return this.onSegmentationPointerDown(
        point,
        worldPoint,
        segmentationToolState!,
      );
    }

    // Mask detections are painted, not dragged/resized
    if (this.hasMask() || this.maskKeypoints) return false;

    if (this.isOnRotateHandle(worldPoint, scale)) {
      this.renderer?.disableZoomPan();
      this.interactionState = "ROTATING";
      this.moveStartRotation = this.#rotation;

      const { x, y, width, height } = this.bounds;
      const pointerAngle = Math.atan2(
        worldPoint.y - (y + height / 2),
        worldPoint.x - (x + width / 2),
      );
      this.rotateGrabOffset = pointerAngle - this.#rotation;

      // satisfy the InteractionManager's gesture bookkeeping
      this.moveStartPoint = point;
      this.moveStartPosition = { x: this.bounds.x, y: this.bounds.y };
      this.moveStartBounds = { ...this.bounds };

      return true;
    }

    const resizeRegion = this.getResizeRegion(worldPoint, scale);
    const cursorState = !this.hasValidBounds()
      ? "SETTING"
      : resizeRegion || "DRAGGING";

    if (cursorState === "DRAGGING" && !this.isDraggable) return false;
    if (cursorState.startsWith("RESIZE_") && !this.isResizeable) return false;

    if (cursorState === "DRAGGING" || cursorState.startsWith("RESIZE_")) {
      this.renderer?.disableZoomPan();
    }

    this.interactionState = cursorState;

    if (cursorState === "SETTING") {
      this.bounds = {
        ...worldPoint,
        height: 0,
        width: 0,
      };
    }

    // Store move start information
    this.moveStartPoint = point;
    this.moveStartPosition = {
      x: this.bounds.x,
      y: this.bounds.y,
    };
    this.moveStartBounds = { ...this.bounds };

    return true;
  }

  private onSegmentationPointerDown(
    point: Point,
    worldPoint: Point,
    toolState: SegmentationToolState,
  ): boolean {
    if (toolState.tool === SegmentationTool.Pen) {
      return this.onPenPointerDown(point, worldPoint, toolState);
    }

    if (!this.hasValidBounds()) {
      // Bootstrap bounds from the brush dab so ensureMaskCanvas has a size
      const size = toolState?.size ?? 0;
      const half = size / 2;

      this.bounds = {
        x: worldPoint.x - half,
        y: worldPoint.y - half,
        width: size,
        height: size,
      };
    }

    this.mask ??= new MaskCanvas(this.label.mask);

    const updatedBounds = this.mask.paintAt(
      worldPoint,
      this.bounds,
      toolState,
      this.currentStyle,
    );

    if (updatedBounds) {
      this.bounds = updatedBounds;
      this.interactionState = "PAINTING";
      this.moveStartPoint = point;
      this.moveStartPosition = {
        x: this.bounds.x,
        y: this.bounds.y,
      };
      this.moveStartBounds = { ...this.bounds };
      this.markDirty();
      this.renderer?.disableZoomPan();
    } else {
      this.bounds = undefined;
    }

    return true;
  }

  private onPenPointerDown(
    _point: Point,
    worldPoint: Point,
    _toolState: SegmentationToolState,
  ): boolean {
    this.maskKeypoints ??= new MaskKeypoints({
      coordinateSystem: this.coordinateSystem,
      renderer: this.renderer,
    });

    this.maskKeypoints.addPoint({ ...worldPoint }, { dragging: false });
    this.interactionState = "PAINTING";
    this.markDirty();

    return true;
  }

  onMove({
    point,
    worldPoint,
    event,
    scale,
    maintainAspectRatio,
    segmentationToolState,
  }: OverlayEvent): boolean {
    this.segmentationTool = segmentationToolState;

    if (this.interactionState === "PAINTING") {
      return this.onSegmentationMove({
        point,
        worldPoint,
        event,
        scale,
        maintainAspectRatio,
        segmentationToolState,
      });
    }

    if (this.interactionState === "DRAGGING") {
      return this.onDrag(point, event, scale);
    }

    if (this.interactionState === "ROTATING") {
      return this.onRotate(worldPoint, event);
    }

    if (
      this.interactionState === "SETTING" ||
      this.interactionState.startsWith("RESIZE_")
    ) {
      return this.onResize(point, event, scale, maintainAspectRatio);
    }

    return false;
  }

  private onRotate(worldPoint: Point, event: PointerEvent): boolean {
    const { x, y, width, height } = this.bounds;
    const pointerAngle = Math.atan2(
      worldPoint.y - (y + height / 2),
      worldPoint.x - (x + width / 2),
    );

    let rotation = pointerAngle - this.rotateGrabOffset;

    if (event.shiftKey) {
      rotation = Math.round(rotation / ROTATION_SNAP) * ROTATION_SNAP;
    }

    this.setRotation(rotation);
    return true;
  }

  private onSegmentationMove({
    point,
    worldPoint,
    event,
    segmentationToolState,
  }: OverlayEvent): boolean {
    if (segmentationToolState?.tool === SegmentationTool.Pen) {
      return this.onPenMove(worldPoint, event);
    }

    const updatedBounds = this.mask?.paintAt(
      worldPoint,
      this.bounds,
      segmentationToolState!,
      this.currentStyle,
    );

    if (updatedBounds) {
      this.bounds = updatedBounds;
      this.interactionState = "PAINTING";
      this.moveStartPoint = point;
      this.moveStartPosition = {
        x: this.bounds.x,
        y: this.bounds.y,
      };
      this.moveStartBounds = { ...this.bounds };
      this.markDirty();
      this.renderer?.disableZoomPan();
    } else {
      this.bounds = undefined;
    }

    return true;
  }

  private onPenMove(worldPoint: Point, event: PointerEvent): boolean {
    this.updatePenMousePosition(worldPoint);

    // Dragging: drop points at intervals
    if (
      event.buttons === LEFT_MOUSE_BUTTON &&
      this.maskKeypoints?.hasValidBounds()
    ) {
      this.maskKeypoints.addPoint({ ...worldPoint }, { dragging: true });
    }

    this.markDirty();
    return true;
  }

  private onDrag(point: Point, _event: PointerEvent, scale: number): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    // Update absolute bounds
    this.bounds = {
      x: this.moveStartBounds.x + delta.x,
      y: this.moveStartBounds.y + delta.y,
      width: this.moveStartBounds.width,
      height: this.moveStartBounds.height,
    };

    return true;
  }

  /**
   * Resizes a rotated box. The gesture runs entirely in the box's local
   * frame: the pointer delta is inverse-rotated, applied to the grabbed
   * local edges, and the resulting center shift is rotated back into world
   * space — so the grabbed edge follows the cursor and the opposite edge
   * stays fixed on screen at any angle. Aspect-ratio lock is not supported
   * while rotated.
   */
  private onResizeRotated(point: Point, scale: number): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const rotation = this.getRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const dx = (point.x - this.moveStartPoint.x) / scale;
    const dy = (point.y - this.moveStartPoint.y) / scale;

    // pointer delta in the box's local frame
    const ldx = dx * cos + dy * sin;
    const ldy = -dx * sin + dy * cos;

    const start = this.moveStartBounds;

    // local edges relative to the gesture-start center
    let left = -start.width / 2;
    let right = start.width / 2;
    let top = -start.height / 2;
    let bottom = start.height / 2;

    const state = this.interactionState;
    if (["RESIZE_NW", "RESIZE_N", "RESIZE_NE"].includes(state)) top += ldy;
    if (["RESIZE_SW", "RESIZE_S", "RESIZE_SE"].includes(state)) bottom += ldy;
    if (["RESIZE_NW", "RESIZE_W", "RESIZE_SW"].includes(state)) left += ldx;
    if (["RESIZE_NE", "RESIZE_E", "RESIZE_SE"].includes(state)) right += ldx;

    // dragging past the opposite edge inverts the box
    if (right < left) [left, right] = [right, left];
    if (bottom < top) [top, bottom] = [bottom, top];

    const width = right - left;
    const height = bottom - top;

    // the local center moved; rotate that offset back into world space
    const lcx = (left + right) / 2;
    const lcy = (top + bottom) / 2;
    const cx = start.x + start.width / 2 + lcx * cos - lcy * sin;
    const cy = start.y + start.height / 2 + lcx * sin + lcy * cos;

    this.bounds = {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
    };

    return true;
  }

  private onResize(
    point: Point,
    _event: PointerEvent,
    scale: number,
    maintainAspectRatio = false,
  ): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    if (this.getRotation() && this.interactionState.startsWith("RESIZE_")) {
      return this.onResizeRotated(point, scale);
    }

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    let maintainX = 0;
    let maintainY = 0;

    if (maintainAspectRatio) {
      const aspectRatio =
        this.moveStartBounds.width && this.moveStartBounds.height
          ? this.moveStartBounds.width / this.moveStartBounds.height
          : 1;

      if (
        Math.abs(delta.x / this.bounds.width) >
        Math.abs(delta.y / this.bounds.height)
      ) {
        maintainY = delta.x / aspectRatio;
      } else {
        maintainX = delta.y * aspectRatio;
      }
    }

    let { x, y, width, height } = this.moveStartBounds;

    if (
      ["RESIZE_NW", "RESIZE_N", "RESIZE_NE"].includes(this.interactionState)
    ) {
      maintainY =
        this.interactionState === "RESIZE_NE" ? maintainY * -1 : maintainY;
      maintainY = this.interactionState === "RESIZE_E" ? 0 : maintainY;

      y += maintainY || delta.y;
      height -= maintainY || delta.y;

      if (this.interactionState === "RESIZE_N") {
        x += maintainX / 2;
        width -= maintainX;
      }
    }

    if (
      ["SETTING", "RESIZE_NW", "RESIZE_W", "RESIZE_SW"].includes(
        this.interactionState,
      )
    ) {
      maintainX =
        this.interactionState === "RESIZE_SW" ? maintainX * -1 : maintainX;
      maintainX = this.interactionState === "RESIZE_W" ? 0 : maintainX;

      x += maintainX || delta.x;
      width -= maintainX || delta.x;

      if (this.interactionState === "RESIZE_W") {
        y += maintainY / 2;
        height -= maintainY;
      }
    }

    if (
      ["SETTING", "RESIZE_SW", "RESIZE_S", "RESIZE_SE"].includes(
        this.interactionState,
      )
    ) {
      maintainY =
        this.interactionState === "RESIZE_SW" ? maintainY * -1 : maintainY;
      maintainY = this.interactionState === "RESIZE_S" ? 0 : maintainY;

      height += maintainY || delta.y;

      if (this.interactionState === "RESIZE_S") {
        x -= maintainX / 2;
        width += maintainX;
      }
    }

    if (
      ["RESIZE_NE", "RESIZE_E", "RESIZE_SE"].includes(this.interactionState)
    ) {
      maintainX =
        this.interactionState === "RESIZE_NE" ? maintainX * -1 : maintainX;
      maintainX = this.interactionState === "RESIZE_E" ? 0 : maintainX;

      width += maintainX || delta.x;

      if (this.interactionState === "RESIZE_E") {
        y -= maintainY / 2;
        height += maintainY;
      }
    }

    if (width < 0) {
      width *= -1;
      x -= width;
    }

    if (height < 0) {
      height *= -1;
      y -= height;
    }

    // Update absolute bounds
    this.bounds = {
      x,
      y,
      width,
      height,
    };

    return true;
  }

  onPointerUp({ segmentationToolState }: OverlayEvent): boolean {
    this.segmentationTool = segmentationToolState;

    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const croppedBounds = this.mask?.paintEnd(this.bounds, (encoded) => {
      this.maskSource = encoded;
      this.markDirty();
      // Mask encoding is async: `pendingMask` only becomes available here, after
      // the synchronous `overlay-paint-end` dispatch below has already run (and
      // read an empty pending mask). Re-emit so the Sample write-half re-reads
      // the overlay and captures the freshly-encoded mask.
      this.eventBus.dispatch("lighter:overlay-commit-requested", {
        id: this.id,
        overlayId: this.id,
        label: this.label,
        hasMask: !!this.mask,
      });
    });

    if (croppedBounds) {
      this.bounds = croppedBounds;
    }

    const wasPainting = this.interactionState === "PAINTING";
    const isEstablishing = this.isBeingEstablished;

    this.isBeingEstablished = false;
    this.interactionState = "NONE";
    this.moveStartPoint = undefined;
    this.moveStartPosition = undefined;
    this.moveStartBounds = undefined;
    this.moveStartRotation = undefined;
    this.renderer?.enableZoomPan();

    if (wasPainting) {
      this.eventBus.dispatch("lighter:overlay-paint-end", {
        id: this.id,
        overlayId: this.id,
        paintStrokeData: this.mask?.getPaintStrokeData(),
        isEstablishing,
      });
    }

    return true;
  }

  /**
   * Determines if current bounds are valid.
   * @returns True if current bounds are valid
   */
  hasValidBounds(): boolean {
    // An overlay without a coordinate system isn't attached to a scene yet
    // (or has been detached); no way to validate bounds.
    if (!this.coordinateSystem) {
      return false;
    }

    return BaseOverlay.validBounds(this.bounds);
  }

  /**
   * Sets whether this overlay can be dragged.
   * @param draggable - Whether the overlay should be draggable.
   */
  setDraggable(draggable: boolean): void {
    if (this.isDraggable !== draggable) {
      this.isDraggable = draggable;
      this.markDirty();
    }
  }

  /**
   * Gets whether this overlay is draggable.
   * @returns True if the overlay is draggable.
   */
  getDraggable(): boolean {
    return this.isDraggable;
  }

  /**
   * Sets whether this overlay can be resized.
   * @param resizeable - Whether the overlay should be resizeable.
   */
  setResizeable(resizeable: boolean): void {
    if (this.isResizeable !== resizeable) {
      this.isResizeable = resizeable;
      this.markDirty();
    }
  }

  /**
   * Gets whether this overlay is resizeable.
   * @returns True if the overlay is resizeable.
   */
  getResizeable(): boolean {
    return this.isResizeable;
  }

  /**
   * Gets the containment level for ordering purposes.
   * @param point - The point to test.
   * @returns The containment level (NONE = 0, CONTENT = 1, BORDER = 2).
   */
  getContainmentLevel(point: Point): CONTAINS {
    const rotation = this.getRotation();

    // the rotate handle floats outside the box; treat it like the header so
    // pointer routing reaches this overlay
    if (
      this.renderer &&
      this.isOnRotateHandle(point, this.renderer.getScale())
    ) {
      return CONTAINS.BORDER;
    }

    if (rotation) {
      const { x, y, width, height } = this.bounds;
      const strokeWidth = this.getCurrentStyle()?.lineWidth ?? STROKE_WIDTH;

      if (
        isPointInRotatedBox(
          [point.x, point.y],
          [x, y, width, height],
          rotation,
          [1, 1],
          strokeWidth,
        )
      ) {
        return CONTAINS.CONTENT;
      }

      if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
        return CONTAINS.BORDER;
      }

      return CONTAINS.NONE;
    }

    const drawnBounds = this.getDrawnBBox();

    // Check if point is inside the main bounding box
    if (this.isPointInRect(point, drawnBounds)) {
      // For mask detections, narrow CONTENT to actual mask pixels so the
      // hit area matches the painted shape rather than the bbox rectangle.
      if (this.hasMask()) {
        return this.mask!.containsMaskPixel(point, this.bounds)
          ? CONTAINS.CONTENT
          : CONTAINS.NONE;
      }
      return CONTAINS.CONTENT;
    }

    // Check if point is in the label text area (header)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return CONTAINS.BORDER;
    }

    return CONTAINS.NONE;
  }

  /**
   * Gets the distance from this overlay to a mouse point.
   * @param point - The mouse point.
   * @returns The distance to the point.
   */
  getMouseDistance(point: Point): number {
    // If point is in header, return 0 (highest priority)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return 0;
    }

    // The rotate handle wins routing outright, like the header
    if (
      this.renderer &&
      this.isOnRotateHandle(point, this.renderer.getScale())
    ) {
      return 0;
    }

    if (this.getRotation()) {
      const corners = this.getWorldCorners();

      return Math.min(
        ...corners.map((corner, i) =>
          distanceFromLineSegment(
            point,
            corner,
            corners[(i + 1) % corners.length],
          ),
        ),
      );
    }

    // Get the drawn bounding box
    const drawnBounds = this.getDrawnBBox();

    // Calculate distance to each edge of the bounding box
    const distances = [
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y },
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y },
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y },
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        },
      ),
      distanceFromLineSegment(
        point,
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        },
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height },
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height },
        { x: drawnBounds.x, y: drawnBounds.y },
      ),
    ];

    return Math.min(...distances);
  }

  /**
   * Get the  {@link CoordinateSystem} of the {@link Scene}
   * @returns {@link CoordinateSystem}
   */
  private getCoordinateSystem() {
    if (!this.coordinateSystem) {
      throw new Error("no coordinate system");
    }

    return this.coordinateSystem;
  }

  /**
   * Gets the drawn bounding box, accounting for stroke width.
   * Similar to looker's getDrawnBBox method.
   * @returns The drawn bounding box with stroke width expansion.
   */
  private getDrawnBBox(): Rect {
    const bounds = this.bounds;
    const strokeWidth = this.getCurrentStyle()?.lineWidth ?? STROKE_WIDTH;

    return {
      x: bounds.x - strokeWidth,
      y: bounds.y - strokeWidth,
      width: bounds.width + strokeWidth * 2,
      height: bounds.height + strokeWidth * 2,
    };
  }

  /**
   * Checks if a point is inside a rectangle.
   * @param point - The point to test.
   * @param rect - The rectangle to test against.
   * @returns True if the point is inside the rectangle.
   */
  private isPointInRect(point: Point, rect: Rect): boolean {
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  }

  /**
   * Tests whether a point in relative coordinates falls on a non-zero mask
   * pixel. Returns `false` when no mask is present or the point is outside the
   * bounding box.
   */
  containsMaskPixel(relativePoint: Point): boolean {
    return (
      this.mask?.containsMaskPixel(relativePoint, this.#relativeBounds) ?? false
    );
  }

  /**
   * For mask detections, hit-test against the actual mask pixels rather than
   * the rectangular bounding box.
   */
  override containsPoint(point: Point): boolean {
    if (this.hasMask() && this.renderer) {
      const worldPoint = this.renderer.screenToWorld(point);
      return this.mask!.containsMaskPixel(worldPoint, this.bounds);
    }
    return super.containsPoint(point);
  }

  // Selectable interface implementation
  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      this.markDirty();
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.BOUNDING_BOX;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    if (this.isSelected()) return null;

    return {
      color: this.currentStyle?.strokeStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "Detection",
    };
  }

  /**
   * Returns true if this detection has a mask (inline, on-disk, or editing canvas).
   */
  hasMask(): boolean {
    return !!this.mask;
  }

  /**
   * Initializes an empty MaskCanvas so the overlay is treated as a mask
   * detection (finer outline, no resize handles) before any paint occurs.
   */
  initMask(): void {
    if (!this.mask) {
      this.mask = new MaskCanvas();
      this.markDirty();
      this.eventBus.dispatch("lighter:overlay-commit-requested", {
        id: this.id,
        overlayId: this.id,
        label: this.label,
        hasMask: true,
      });
    }
  }

  /**
   * Removes the mask from this detection, destroying the MaskCanvas.
   */
  removeMask(): void {
    const hadMask = !!this.mask;
    this.maskSource = undefined;
    this.mask?.destroy();
    this.mask = undefined;
    this.markDirty();
    if (hadMask) {
      this.eventBus.dispatch("lighter:overlay-commit-requested", {
        id: this.id,
        overlayId: this.id,
        label: this.label,
        hasMask: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Pen tool
  // ---------------------------------------------------------------------------

  /**
   * Returns true if a pen polygon is currently being built.
   */
  hasPenPolygon(): boolean {
    return this.maskKeypoints?.hasValidBounds();
  }

  /**
   * Adds a point to the in-progress pen polygon. Lazily constructs the
   * `MaskKeypoints` overlay on the first call. Returns the new point id, or
   * `null` if the dragging-throttle rejected the placement.
   */
  addMaskKeypoint(
    worldPoint: Point,
    options?: { id?: string; variant?: string; dragging?: boolean },
  ): string | null {
    this.maskKeypoints ??= new MaskKeypoints({
      coordinateSystem: this.coordinateSystem,
      renderer: this.renderer,
    });

    const pointId = this.maskKeypoints.addPoint({ ...worldPoint }, options);
    if (pointId !== null) {
      this.interactionState = "PAINTING";
      this.markDirty();
    }
    return pointId;
  }

  /**
   * Removes a pen-polygon point by id. Disposes the in-progress polygon when
   * the last point is removed so a subsequent click starts a fresh ring.
   */
  removeMaskKeypointById(pointId: string): void {
    if (!this.maskKeypoints) return;

    this.maskKeypoints.removePointById(pointId);

    if (this.maskKeypoints.getAbsolutePoints().length === 0) {
      this.maskKeypoints.destroy();
      this.maskKeypoints = undefined;
      this.interactionState = "NONE";
    }

    this.markDirty();
  }

  /**
   * Number of points currently in the in-progress pen polygon.
   */
  getMaskKeypointCount(): number {
    return this.maskKeypoints?.getAbsolutePoints().length ?? 0;
  }

  /**
   * Fills the pen polygon onto the mask canvas and clears the pen state.
   * Uses the current paint mode from the last known segmentation state.
   */
  commitPenPolygon({ segmentationToolState }: OverlayEvent): boolean {
    if (!this.maskKeypoints) return false;

    const absolutePoints = this.maskKeypoints.getAbsolutePoints();

    if (absolutePoints.length < 3) {
      this.cancelPenPolygon();
      return false;
    }

    if (!this.hasValidBounds()) {
      this.bounds = this.maskKeypoints.bounds;
    }

    this.mask ??= new MaskCanvas(this.label.mask);

    const updatedBounds = this.mask.fillPolygon(
      absolutePoints,
      this.bounds,
      segmentationToolState,
      this.currentStyle,
    );

    if (updatedBounds) {
      this.bounds = updatedBounds;
    }

    this.bounds = this.mask.paintEnd(this.bounds, (encoded) => {
      this.maskSource = encoded;
      this.markDirty();
      // Mask encoding is async: `pendingMask` only becomes available here, after
      // the synchronous `overlay-paint-end` dispatch below has already run (and
      // read an empty pending mask). Re-emit so the Sample write-half re-reads
      // the overlay and captures the freshly-encoded mask.
      this.eventBus.dispatch("lighter:overlay-commit-requested", {
        id: this.id,
        overlayId: this.id,
        label: this.label,
        hasMask: !!this.mask,
      });
    });

    const isEstablishing = this.isBeingEstablished;
    this.isBeingEstablished = false;

    this.eventBus.dispatch("lighter:overlay-paint-end", {
      id: this.id,
      overlayId: this.id,
      paintStrokeData: this.mask?.getPaintStrokeData(),
      isEstablishing,
    });

    this.cancelPenPolygon();
    return true;
  }

  /**
   * Discards the current pen polygon without filling.
   */
  cancelPenPolygon(): void {
    this.maskKeypoints?.destroy();
    this.maskKeypoints = undefined;
    this.interactionState = "NONE";
    this.markDirty();
  }

  /**
   * Updates the pen cursor position for live preview rendering.
   */
  updatePenMousePosition(worldPoint: Point | null): void {
    if (!this.maskKeypoints) return;

    this.maskKeypoints.setPreviewPoint(worldPoint);
    this.markDirty();
  }

  /**
   * Whether segmentation brush/pen should intercept pointer events.
   */
  private isPaintingActive(): boolean {
    if (!this.segmentationTool?.active) return false;

    return (
      this.segmentationTool.tool === SegmentationTool.Brush ||
      this.segmentationTool.tool === SegmentationTool.Pen
    );
  }

  /**
   * Consumes and returns the pending encoded mask, if any.
   * After calling, the pending mask is cleared.
   */
  getPendingMask(): string | undefined {
    return this.mask?.getPendingMask();
  }

  /**
   * Returns the mask as a drawable source for sidebar preview rendering.
   */
  getMaskPreviewSource(): HTMLCanvasElement | ImageBitmap | undefined {
    return this.mask?.getPreviewSource();
  }

  // ---------------------------------------------------------------------------
  // Merging mask detections
  // ---------------------------------------------------------------------------

  /**
   * Merges another detection's mask into this one. Expands this overlay's
   * bounds to the union AABB and composites the source mask's pixels (binary
   * OR). Captures pre/post snapshots — call {@link getPaintStrokeData} after
   * to retrieve them for undo.
   *
   * Returns `true` on success, `false` if the source has no decoded mask
   * (e.g. still loading).
   */
  mergeFrom(source: DetectionOverlay, gestureId?: string): boolean {
    const sourceSource = source.mask?.getPreviewSource();
    if (!this.mask || !sourceSource) return false;

    const newBounds = this.mask.mergeFrom(
      sourceSource,
      source.bounds,
      this.bounds,
      (encoded) => {
        this.maskSource = encoded;
        // Mask encoding is async: `pendingMask` only becomes available here,
        // after the synchronous `overlay-commit-requested` dispatch below has
        // already run (and read an empty pending mask). Re-emit so the
        // write-half re-reads the overlay and captures the merged mask —
        // the same dance as `onPointerUp`'s paint-end. `gestureId` correlates
        // this async commit to the same merge gesture as the sync one below.
        this.eventBus.dispatch("lighter:overlay-commit-requested", {
          id: this.id,
          overlayId: this.id,
          label: this.label,
          hasMask: this.hasMask(),
          gestureId,
        });
      },
    );

    this.bounds = newBounds;
    this.markDirty();

    const [x, y, w, h] = [
      this.relativeBounds.x,
      this.relativeBounds.y,
      this.relativeBounds.width,
      this.relativeBounds.height,
    ];
    const updatedLabel = { ...this.label, bounding_box: [x, y, w, h] };

    this.eventBus.dispatch("lighter:overlay-commit-requested", {
      id: this.id,
      overlayId: this.id,
      label: updatedLabel,
      hasMask: this.hasMask(),
      gestureId,
    });

    return true;
  }

  // ---------------------------------------------------------------------------
  // Segmentation undo/redo support
  // ---------------------------------------------------------------------------

  getPaintStrokeData(): PaintStrokeData | undefined {
    return this.mask?.getPaintStrokeData();
  }

  restoreMaskSnapshot(
    snapshot: MaskSnapshot | undefined,
    bounds: Rect | undefined,
  ): void {
    this.mask ??= new MaskCanvas();

    if (snapshot) {
      this.mask.restoreSnapshot(snapshot, (encoded) => {
        this.maskSource = encoded;
        // Mask encoding is async — same re-emit dance as `mergeFrom` and
        // paint-end: the synchronous dispatch below reads an empty pending
        // mask; re-emit so the write-half captures the restored mask.
        this.eventBus.dispatch("lighter:overlay-commit-requested", {
          id: this.id,
          overlayId: this.id,
          label: this.label,
          hasMask: this.hasMask(),
        });
      });
    } else {
      // Clearing to "no mask" — drop the rehydration source too so a later
      // destroy/re-add doesn't resurrect a stale serialized payload.
      this.mask.restoreSnapshot(undefined);
      this.maskSource = undefined;
    }
    this.bounds = bounds;
    this.markDirty();

    // restores are edits too (undo/redo, failure rollback) — dispatch so the
    // write-half commits the restored bounds now; the restored mask follows
    // on the encode re-emit above
    this.eventBus.dispatch("lighter:overlay-commit-requested", {
      id: this.id,
      overlayId: this.id,
      label: this.label,
      hasMask: this.hasMask(),
    });
  }

  /**
   * Re-creates the mask canvas from {@link label}.mask after a destroy/re-add
   * cycle (e.g. undoing a deletion). No-op if the mask is already present or
   * if the label has no mask data.
   */
  rehydrateMask(): void {
    if (this.mask) return;
    if (!this.maskSource) return;

    this.mask = new MaskCanvas(this.maskSource);

    this.forceHoverLeave();
    this.markDirty();
  }

  override destroy(): void {
    this.mask?.destroy();
    this.mask = undefined;
    this.maskKeypoints?.destroy();
    this.maskKeypoints = undefined;
    super.destroy();
  }
}
