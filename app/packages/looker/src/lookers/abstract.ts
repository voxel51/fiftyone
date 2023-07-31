import {
  AppError,
  DATE_FIELD,
  DATE_TIME_FIELD,
  LABELS,
  LABELS_PATH,
  LABEL_LISTS,
  LABEL_LISTS_MAP,
  LIST_FIELD,
  Schema,
  withPath,
} from "@fiftyone/utilities";
import { v4 as uuid } from "uuid";

import {
  BASE_ALPHA,
  DASH_LENGTH,
  FONT_SIZE,
  PAD,
  POINT_RADIUS,
  STROKE_WIDTH,
} from "../constants";
import { COMMON_SHORTCUTS, LookerElement } from "../elements/common";
import { ClassificationsOverlay, loadOverlays } from "../overlays";
import { CONTAINS, Overlay } from "../overlays/base";
import processOverlays from "../processOverlays";
import {
  BaseState,
  Coordinates,
  Dimensions,
  LabelData,
  Optional,
  Sample,
  StateUpdate,
} from "../state";
import {
  createWorker,
  getDPR,
  getElementBBox,
  getFitRect,
  getMimeType,
  mergeUpdates,
  snapBox,
} from "../util";

import { Events } from "../elements/base";
import { ProcessSample } from "../worker";
import { LookerUtils } from "./shared";

const LABEL_LISTS_PATH = new Set(withPath(LABELS_PATH, LABEL_LISTS));
const LABEL_LIST_KEY = Object.fromEntries(
  Object.entries(LABEL_LISTS_MAP).map(([k, v]) => [withPath(LABELS_PATH, k), v])
);
const LABELS_SET = new Set(LABELS);

const getLabelsWorker = (() => {
  const numWorkers =
    typeof window !== "undefined" ? navigator.hardwareConcurrency || 4 : 1;
  let workers: Worker[];

  let next = -1;
  return (dispatchEvent) => {
    if (!workers) {
      workers = [];
      for (let i = 0; i < numWorkers; i++) {
        workers.push(createWorker(LookerUtils.workerCallbacks, dispatchEvent));
      }
    }

    next++;
    next %= numWorkers;
    return workers[next];
  };
})();

export abstract class AbstractLooker<
  State extends BaseState = BaseState,
  S extends Sample = Sample
> {
  private eventTarget: EventTarget;
  private hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;
  protected lookerElement: LookerElement<State>;
  private resizeObserver: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private previousState?: Readonly<State>;
  private readonly rootEvents: Events<State>;

  protected sampleOverlays: Overlay<State>[];
  protected currentOverlays: Overlay<State>[];
  protected pluckedOverlays: Overlay<State>[];
  protected sample: S;
  protected state: State;
  protected readonly updater: StateUpdate<State>;

  constructor(
    sample: S,
    config: State["config"],
    options: Optional<State["options"]> = {}
  ) {
    this.eventTarget = new EventTarget();
    this.updater = this.makeUpdate();
    this.state = this.getInitialState(config, options);
    this.loadSample(sample);
    this.state.options.mimetype = getMimeType(sample);
    this.pluckedOverlays = [];
    this.currentOverlays = [];
    this.lookerElement = this.getElements(config);
    this.canvas = this.lookerElement.children[1].element as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d");

    this.resizeObserver = new ResizeObserver(() => {
      const box = getElementBBox(this.lookerElement.element);
      box[2] &&
        box[3] &&
        this.lookerElement &&
        this.updater({
          windowBBox: box,
        });
    });

    this.rootEvents = {};
    const events = this.getRootEvents();
    for (const eventType in events) {
      this.rootEvents[eventType] = (event) =>
        events[eventType]({
          event,
          update: this.updater,
        });
    }

    this.hideControlsTimeout = setTimeout(
      () =>
        this.updater(
          ({ showOptions, hoveringControls, options: { showControls } }) => {
            this.hideControlsTimeout = null;
            if (!showOptions && !hoveringControls && showControls) {
              return { options: { showControls: false } };
            }
            return {};
          }
        ),
      3500
    );
  }

  loadOverlays(sample: Sample): void {
    this.sampleOverlays = loadOverlays(sample);
  }

  pluckOverlays(state: Readonly<State>): Overlay<State>[] {
    return this.sampleOverlays;
  }

  protected dispatchEvent(eventType: string, detail: any): void {
    if (detail instanceof ErrorEvent) {
      this.updater({ error: detail.error });
      return;
    }
    if (detail instanceof Event) {
      this.eventTarget.dispatchEvent(
        // @ts-ignore
        new detail.constructor(detail.type, detail)
      );
      return;
    }

    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  protected dispatchImpliedEvents(
    { options: prevOtions }: Readonly<State>,
    { options }: Readonly<State>
  ): void {
    if (options.showJSON !== prevOtions.showJSON) {
      this.dispatchEvent("options", { showJSON: options.showJSON });
    }
  }

  protected getDispatchEvent(): (eventType: string, detail: any) => void {
    return (eventType: string, detail: any) => {
      if (eventType === "selectthumbnail") {
        this.dispatchEvent(eventType, {
          shiftKey: detail,
          sampleId: this.sample.id,
          sample: this.sample,
        });
        return;
      }

      this.dispatchEvent(eventType, detail);
    };
  }

  private makeUpdate(): StateUpdate<State> {
    return (stateOrUpdater, postUpdate) => {
      try {
        const updates =
          stateOrUpdater instanceof Function
            ? stateOrUpdater(this.state)
            : stateOrUpdater;
        if (
          !this.lookerElement ||
          (Object.keys(updates).length === 0 && !postUpdate)
        ) {
          return;
        }

        this.previousState = this.state;
        this.state = mergeUpdates(this.state, updates);

        // Need this because when user reset attributeVisibility, it resets
        // to empty object, which gets overwritten in mergeUpdates
        if (JSON.stringify(updates.options?.attributeVisibility) === "{}") {
          this.state.options.attributeVisibility = {};
        }

        if (!this.state.loaded && this.sample) {
          this.lookerElement.render(this.state, this.sample);
          return;
        }

        if (
          !this.state.windowBBox ||
          this.state.destroyed ||
          !this.state.overlaysPrepared ||
          this.state.disabled
        ) {
          return;
        }

        this.pluckedOverlays = this.pluckOverlays(this.state);
        this.state = this.postProcess();

        [this.currentOverlays, this.state.rotate] = processOverlays(
          this.state,
          this.pluckedOverlays
        );

        this.state.mouseIsOnOverlay =
          Boolean(this.currentOverlays.length) &&
          this.currentOverlays[0].containsPoint(this.state) > CONTAINS.NONE;

        postUpdate && postUpdate(this.state, this.currentOverlays, this.sample);

        this.dispatchImpliedEvents(this.previousState, this.state);

        this.lookerElement.render(this.state, this.sample);
        const ctx = this.ctx;

        if (this.waiting || this.state.error) {
          return;
        }

        ctx.lineWidth = this.state.strokeWidth;
        ctx.font = `bold ${this.state.fontSize.toFixed(2)}px Palanquin`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.imageSmoothingEnabled = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = getDPR();
        ctx.clearRect(
          0,
          0,
          this.state.windowBBox[2] * dpr,
          this.state.windowBBox[3] * dpr
        );

        ctx.translate(this.state.pan[0] * dpr, this.state.pan[1] * dpr);
        const scale = this.state.scale * dpr;
        ctx.scale(scale, scale);

        const [tlx, tly, w, h] = this.state.canvasBBox;

        ctx.drawImage(
          this.getImageSource(),
          0,
          0,
          this.state.dimensions[0],
          this.state.dimensions[1],
          tlx,
          tly,
          w,
          h
        );

        ctx.globalAlpha = Math.min(1, this.state.options.alpha / BASE_ALPHA);
        const numOverlays = this.currentOverlays.length;

        for (let index = numOverlays - 1; index >= 0; index--) {
          this.currentOverlays[index].draw(ctx, this.state);
        }
        ctx.globalAlpha = 1;

        ctx.canvas.setAttribute("sample-loaded", "true");
        ctx.canvas.dispatchEvent(
          new CustomEvent("sample-loaded", {
            detail: { sampleFilepath: this.sample.filepath },
            bubbles: true,
          })
        );
      } catch (error) {
        if (error instanceof AppError || error instanceof MediaError) {
          this.updater({ error });
        } else {
          this.eventTarget.dispatchEvent(new ErrorEvent("error", { error }));
        }
      }
    };
  }

  addEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    ...args: any[]
  ) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    ...args: any[]
  ) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  getRootEvents(): Events<State> {
    return {
      mouseenter: ({ update }) =>
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return { hovering: true };
          }
          return {
            hovering: true,
            showControls: true,
          };
        }),
      mouseleave: ({ update }) => {
        !this.state.config.thumbnail &&
          this.dispatchEvent("options", { showControls: false });
        update({
          hovering: false,
          disableControls: false,
          showOptions: false,
          panning: false,
        });
      },
      mousemove: ({ update }) => {
        if (this.state.config.thumbnail) {
          return;
        }
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
        }
        this.hideControlsTimeout = setTimeout(
          () =>
            update(
              ({
                options: { showControls },
                showOptions,
                hoveringControls,
              }) => {
                this.hideControlsTimeout = null;
                if (!showOptions && !hoveringControls && showControls) {
                  this.dispatchEvent("options", { showControls: false });
                }
                return {};
              }
            ),
          3500
        );
      },
    };
  }

  attach(element: HTMLElement | string, dimensions?: Dimensions): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    if (element === this.lookerElement.element.parentElement) {
      this.state.disabled && this.updater({ disabled: false });
      return;
    }

    if (this.lookerElement.element.parentElement) {
      const parent = this.lookerElement.element.parentElement;
      this.resizeObserver.disconnect();
      parent.removeChild(this.lookerElement.element);

      for (const eventType in this.rootEvents) {
        parent.removeEventListener(eventType, this.rootEvents[eventType]);
      }
    }

    for (const eventType in this.rootEvents) {
      element.addEventListener(eventType, this.rootEvents[eventType]);
    }
    this.updater({
      windowBBox: dimensions ? [0, 0, ...dimensions] : getElementBBox(element),
      disabled: false,
    });
    element.appendChild(this.lookerElement.element);
    !dimensions && this.resizeObserver.observe(element);
  }

  resize(dimensions: Dimensions): void {
    this.updater({
      windowBBox: [0, 0, ...dimensions],
    });
  }

  detach(): void {
    this.resizeObserver.disconnect();
    this.lookerElement.element.parentNode &&
      this.lookerElement.element.parentNode.removeChild(
        this.lookerElement.element
      );
  }

  abstract updateOptions(options: Optional<State["options"]>): void;

  updateSample(sample: Sample) {
    this.loadSample(sample);
  }

  getSample(): Promise<Sample> {
    const sample = { ...this.sample };

    return Promise.resolve(
      f({
        value: sample,
        filter: this.state.options.filter,
        schema: this.state.config.fieldSchema,
        active: this.state.options.activePaths,
      })
    );
  }

  getCurrentSampleLabels(): LabelData[] {
    const labels: LabelData[] = [];
    this.currentOverlays.forEach((overlay) => {
      if (overlay instanceof ClassificationsOverlay) {
        overlay.getFilteredAndFlat(this.state).forEach(([field, label]) => {
          labels.push({
            field: field,
            labelId: label.id,
            sampleId: this.sample.id,
          });
        });
      } else {
        const { id: labelId, field } = overlay.getSelectData(this.state);
        labels.push({ labelId, field, sampleId: this.sample.id });
      }
    });

    return labels;
  }

  protected get waiting() {
    return false;
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.lookerElement.element.parentElement &&
      this.lookerElement.element.parentElement.removeChild(
        this.lookerElement.element
      );
    this.updater({ destroyed: true });
  }
  disable() {
    this.updater({ disabled: true });
  }

  protected abstract hasDefaultZoom(
    state: State,
    overlays: Overlay<State>[]
  ): boolean;

  protected abstract getElements(
    config: Readonly<State["config"]>
  ): LookerElement<State>;

  protected abstract getDefaultOptions(): State["options"];

  protected abstract getInitialState(
    config: State["config"],
    options: Optional<State["options"]>
  ): State;

  protected getImageSource(): CanvasImageSource {
    return this.lookerElement.children[0].imageSource;
  }

  protected getInitialBaseState(): Omit<BaseState, "config" | "options"> {
    return {
      disabled: false,
      cursorCoordinates: [0, 0],
      pixelCoordinates: [0, 0],
      relativeCoordinates: [0, 0],
      disableControls: false,
      hovering: false,
      hoveringControls: false,
      showOptions: false,
      loaded: false,
      scale: 1,
      pan: <Coordinates>[0, 0],
      rotate: 0,
      panning: false,
      strokeWidth: STROKE_WIDTH,
      dashLength: DASH_LENGTH,
      fontSize: FONT_SIZE,
      wheeling: false,
      transformedWindowBBox: null,
      windowBBox: null,
      transformedMediaBBox: null,
      mediaBBox: null,
      canvasBBox: null,
      textPad: PAD,
      pointRadius: POINT_RADIUS,
      mouseIsOnOverlay: false,
      overlaysPrepared: false,
      disableOverlays: false,
      zoomToContent: false,
      setZoom: true,
      hasDefaultZoom: true,
      SHORTCUTS: COMMON_SHORTCUTS,
      error: null,
      destroyed: false,
      reloading: false,
    };
  }

  protected postProcess(): State {
    if (!this.state.dimensions) {
      throw new Error("media not loaded");
    }
    const [tlx, tly, w, h] = this.state.windowBBox;
    this.state.pan = snapBox(
      this.state.scale,
      this.state.pan,
      [w, h],
      this.state.dimensions
    );
    this.state.mediaBBox = getFitRect(
      this.state.dimensions,
      this.state.windowBBox
    );
    this.state.transformedWindowBBox = [
      tlx + this.state.pan[0],
      tly + this.state.pan[1],
      this.state.scale * w,
      this.state.scale * h,
    ];

    this.state.transformedMediaBBox = getFitRect(
      this.state.dimensions,
      this.state.transformedWindowBBox
    );
    this.state.canvasBBox = [
      this.state.mediaBBox[0] - this.state.windowBBox[0],
      this.state.mediaBBox[1] - this.state.windowBBox[1],
      this.state.mediaBBox[2],
      this.state.mediaBBox[3],
    ];
    this.state.relativeCoordinates = [
      (this.state.cursorCoordinates[0] - this.state.transformedMediaBBox[0]) /
        this.state.transformedMediaBBox[2],
      (this.state.cursorCoordinates[1] - this.state.transformedMediaBBox[1]) /
        this.state.transformedMediaBBox[3],
    ];
    this.state.pixelCoordinates = [
      this.state.relativeCoordinates[0] * this.state.dimensions[0],
      this.state.relativeCoordinates[1] * this.state.dimensions[1],
    ];
    this.state.fontSize = FONT_SIZE / this.state.scale;
    this.state.pointRadius = POINT_RADIUS / this.state.scale;
    this.state.strokeWidth = STROKE_WIDTH / this.state.scale;
    this.state.dashLength = DASH_LENGTH / this.state.scale;
    this.state.config.thumbnail && (this.state.strokeWidth /= 3);
    this.state.textPad = PAD / this.state.scale;

    this.state.hasDefaultZoom = this.hasDefaultZoom(
      this.state,
      this.pluckedOverlays
    );

    return this.state;
  }

  protected hasResized(): boolean {
    return Boolean(
      !this.previousState?.windowBBox ||
        !this.state?.windowBBox ||
        this.previousState.windowBBox.some(
          (v, i) => v !== this.state.windowBBox[i]
        )
    );
  }

  private loadSample(sample: Sample) {
    const messageUUID = uuid();
    const labelsWorker = getLabelsWorker((event, detail) =>
      this.dispatchEvent(event, detail)
    );
    const listener = ({ data: { sample, coloring, uuid } }) => {
      if (uuid === messageUUID) {
        this.sample = sample;
        this.state.options.coloring = coloring;
        this.loadOverlays(sample);
        this.updater({
          overlaysPrepared: true,
          disabled: false,
          reloading: false,
        });
        labelsWorker.removeEventListener("message", listener);
      }
    };
    labelsWorker.addEventListener("message", listener);

    labelsWorker.postMessage({
      sample: sample as ProcessSample["sample"],
      method: "processSample",
      coloring: this.state.options.coloring,
      customizeColorSetting: this.state.options.customizeColorSetting,
      sources: this.state.config.sources,
      uuid: messageUUID,
    } as ProcessSample);
  }
}

const mapFields = (value, schema: Schema, ftype: string) => {
  if ([DATE_TIME_FIELD, DATE_FIELD].includes(ftype)) {
    return new Date(value.datetime);
  }

  if (typeof value !== "object") {
    return value;
  }

  const result = {};
  for (const fieldName in value) {
    const field = schema[fieldName];
    if (!field) {
      result[fieldName] = value[fieldName];
      continue;
    }

    const { dbField, ftype } = field;
    const key = fieldName === "id" ? "id" : dbField || fieldName;

    if (value[key] === undefined) continue;

    if (value[key] === null) {
      result[fieldName] = null;
      continue;
    }

    if (ftype === LIST_FIELD) {
      result[fieldName] = value[key].map((v) =>
        mapFields(v, schema[fieldName].fields, schema[fieldName].subfield)
      );
    } else {
      result[fieldName] = mapFields(
        value[key],
        schema[fieldName].fields,
        schema[fieldName].ftype
      );
    }
  }

  return result;
};

const f = <T extends {}>({
  schema,
  filter,
  value,
  keys = [],
  active,
}: {
  active: string[];
  value: T;
  schema: Schema;
  keys?: string[];
  filter: (path: string, value) => boolean;
}): T => {
  const result = {};
  for (const fieldName in schema) {
    if (fieldName.startsWith("_")) continue;

    const path = [...keys, fieldName].join(".");

    const { dbField, embeddedDocType } = schema[fieldName];

    if (LABEL_LISTS_PATH.has(embeddedDocType)) {
      if (!active.includes(path)) continue;

      result[dbField || fieldName] = value[dbField || fieldName];

      if (result[dbField || fieldName][LABEL_LIST_KEY[embeddedDocType]]) {
        result[dbField || fieldName][LABEL_LIST_KEY[embeddedDocType]] = result[
          dbField || fieldName
        ][LABEL_LIST_KEY[embeddedDocType]].filter((v) => filter(path, v));
      }
    } else if (
      LABELS_SET.has(embeddedDocType) &&
      filter(path, value[dbField || fieldName])
    ) {
      if (!active.includes(path)) continue;

      result[dbField || fieldName] = value[dbField || fieldName];
    } else {
      result[dbField || fieldName] = value[dbField || fieldName];
    }
  }

  return mapFields(result, schema, null) as T;
};
