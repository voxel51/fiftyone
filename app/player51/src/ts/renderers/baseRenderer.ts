import EventTarget from "@ungap/event-target";
import { ICONS, rescale } from "../util.js";

export default abstract class Renderer {
  eventTarget = new EventTarget();
  metadataOverlayBGColor = "hsla(210, 20%, 10%, 0.8)";
  sample;
  parent: HTMLElement;

  private isRendered = false;
  private isSizePrepared = false;
  private rect;
  private orderedOverlayCache: any[];
  private focusIndex;

  constructor(media, sample, options) {
    this.parent = undefined;
    this.this.options = options;

    this.overlayOptions = Object.assign(
      {
        showFrameCount: false,
        labelsOnlyOnClick: false,
        attrsOnlyOnClick: false,
        showAttrs: true,
        showConfidence: true,
        showTooltip: true,
        attrRenderMode: "value",
        attrRenderBox: true,
        action: "click",
        smoothMasks: true,
      },
      this.options.defaultOverlayOptions
    );
    this._actionOptions = {
      click: { name: "Click", type: "click", labelText: "clicked" },
      hover: { name: "Hover", type: "mousemove", labelText: "hovered" },
    };
    this._attrRenderModeOptions = [
      {
        name: "Value",
        value: "value",
      },
      {
        name: "Attribute: Value",
        value: "attr-value",
      },
    ];
    this._overlayOptionWrappers = {}; // overlayOptions key -> element
    this._focusIndex = -1;
    this.seekBarMax = 100;
    // Loading state attributes
    this._frameNumber = undefined;
    this._isDataLoaded = false;
    this._mouseX = null;
    this._mouseY = null;
    this._overlayHasDetectionAttrs = false;
    this._timeouts = {};
    this._canFocus = true;
    this._focusPos = { x: -1, y: -1 };
    this._boolHoveringControls = false;
    this._boolDisableShowControls = false;
    this._boolShowControls = false;
    this._overlays = [];
    this._orderedOverlayCache = null;
    this._rotateIndex = 0;
    this._handleMouseEvent = this._handleMouseEvent.bind(this);
  }

  destroy() {
    Object.entries(this.parent.children).forEach(([_, child]) => {
      this.parent.removeChild(child);
    });
  }

  abstract initPlayer(): void;

  abstract initPlayerControls(): void;

  abstract updateFromDynamicState(): void;

  abstract updateFromLoadingState(): void;

  abstract customDraw(): void;

  dispatchEvent(eventType: string, { data, ...args }): boolean {
    const e = new Event(eventType, args);
    e.data = data;
    return this.eventTarget.dispatchEvent(e);
  }

  private reBindMouseHandler() {
    for (const action of Object.values(this._actionOptions)) {
      this.eleCanvas.removeEventListener(action.type, this._handleMouseEvent);
    }
    const eventType = this._actionOptions[this.overlayOptions.action].type;
    this.eleCanvas.addEventListener(eventType, this._handleMouseEvent);
    if (eventType !== "click") {
      this.eleCanvas.addEventListener("click", this._handleMouseEvent);
    }
  }

  private processFrame() {
    if (!this._isReadyProcessFrames) {
      return;
    }
    clearCanvas(this.eleCanvas, this.canvasWidth, this.canvasHeight);
    const context = this.setupCanvasContext();
    this.customDraw(context);
    if (this._isOverlayPrepared) {
      if (this._frameNumber in this._overlays) {
        // Hover Focus setting

        let overlays = this._getOrderedOverlays(this._focusPos);
        if (this.overlayOptions.action === "hover") {
          this.setFocus(overlays[0]);
        }

        const len = overlays.length;
        // draw items without focus first, if settings allow
        if (this._renderRest()) {
          for (let i = len - 1; i > 0; i--) {
            overlays[i].draw(context, this.canvasWidth, this.canvasHeight);
          }
        }
        overlays[0] &&
          overlays[0].draw(context, this.canvasWidth, this.canvasHeight);
      }
    }
  }

  computeEventCoordinates = function (e) {
    if (e.type.toLowerCase() === "mousemove") {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
      this._rect = e.target.getBoundingClientRect();
    }
    let [x, y] = [this._mouseX, this._mouseY];

    if (this._rect) {
      x = x - this._rect.left;
      y = y - this._rect.top;
    }

    return [
      Math.round(rescale(x, 0, this._rect.width, 0, this.eleCanvas.width)),
      Math.round(rescale(y, 0, this._rect.height, 0, this.eleCanvas.height)),
    ];
  };

  handleMouseEvent(e) {
    const eventType = e.type.toLowerCase();

    const [x, y] = this._computeEventCoordinates(e);
    const pointY = Math.floor((y / this.canvasHeight) * this.height);
    const pointX = Math.floor((x / this.canvasWidth) * this.width);

    const pausedOrImage = !this.eleVideo || this.eleVideo.paused;

    const notThumbnail = !this.player.options.thumbnail;

    let rotation = false;
    let fm = this._getOrderedOverlays({ x, y });
    const mousemove = eventType === "mousemove";
    if (pausedOrImage && notThumbnail) {
      let down = null;
      let up = null;
      if (eventType === "keydown" && this._canFocus) {
        if (e.key === "ArrowDown") {
          down = true;
        } else if (e.key === "ArrowUp") {
          up = true;
        }
      }
      if (down || up) {
        rotation = true;
        e.stopPropagation();
        e.preventDefault();
        const contained = fm.filter((o) => o.containsPoint(x, y) > 0).length;
        if (up && contained > 1 && this._rotateIndex > 0) {
          fm = [
            fm[contained - 1],
            ...fm.slice(0, contained - 1),
            ...fm.slice(contained),
          ];
          this._rotateIndex -= 1;
        } else if (down && contained > 1 && this._rotateIndex < contained - 1) {
          fm = [...fm.slice(1, contained), fm[0], ...fm.slice(contained)];
          this._rotateIndex += 1;
        }
        this._orderedOverlayCache = fm;
      } else if (mousemove) {
        this._orderedOverlayCache = null;
        this._rotateIndex = 0;
      }
    }

    const topObj = fm && fm[0] && fm[0].containsPoint(x, y) > 0 ? fm[0] : null;
    if (eventType === "click" && topObj && topObj.isSelectable(x, y)) {
      this.dispatchEvent("select", {
        data: topObj.getSelectData(x, y),
      });
    }
    let processFrame = topObj && this.setFocus(topObj, { x, y });

    if (pausedOrImage && notThumbnail && (mousemove || rotation)) {
      let result = topObj ? topObj.getPointInfo(x, y) : [];
      if (!Array.isArray(result)) {
        result = [result];
      }

      this.overlayOptions.showTooltip &&
        this.dispatchEvent("tooltipinfo", {
          data: {
            overlays: result,
            point: [pointX, pointY],
          },
        });
    }

    processFrame && this.processFrame();
  }

  handleKeyboardEvent(e) {
    // esc: hide settings
    if (e.keyCode === 27 && this._boolShowVideoOptions) {
      this._boolShowVideoOptions = false;
      this._repositionOptionsPanel();
      this.updateFromDynamicState();
      return true;
    }
    // s: toggle settings
    if (e.key === "s") {
      this._boolShowVideoOptions = !this._boolShowVideoOptions;
      this._repositionOptionsPanel();
      this.updateFromDynamicState();
      return true;
    }
  }

  handleFocusLost() {
    this._boolShowVideoOptions = false;
    this._boolShowControls = false;
    this.updateFromDynamicState();
  }

  initCanvas() {
    this.checkParentandMedia();
    this.eleDivCanvas = document.createElement("div");
    this.eleDivCanvas.className = "p51-contained-canvas";
    this.eleCanvas = document.createElement("canvas");
    this.eleCanvas.className = "p51-contained-canvas";
    this.eleDivCanvas.appendChild(this.eleCanvas);
    this.parent.appendChild(this.eleDivCanvas);
  }

  checkMouseOnControls(e) {
    if (
      this.eleDivVideoControls &&
      this.eleDivVideoControls.contains(e.target)
    ) {
      return true;
    } else if (
      this.eleDivVideoOpts &&
      this.eleDivVideoOpts.contains(e.target)
    ) {
      return true;
    }
    return false;
  }

  updateControlsDisplayState() {
    if (!this.eleDivVideoControls) {
      return;
    }
    if (this._boolShowControls && !this._boolDisableShowControls) {
      this.eleDivVideoControls.style.opacity = "0.9";
      this.eleDivVideoControls.style.height = "unset";
    } else {
      this.eleDivVideoControls.style.opacity = "0.0";
      this.eleDivVideoControls.style.height = 0;
      if (this.player.options.thumbnail) {
        this.eleDivVideoControls.remove();
      }
    }
    this._updateOptionsDisplayState();
  }

  _updateOptionsDisplayState() {
    if (!this.eleDivVideoOpts) {
      return;
    }
    if (
      this._boolShowVideoOptions &&
      this._boolShowControls &&
      !this._boolDisableShowControls
    ) {
      this.eleDivVideoOpts.style.opacity = "0.9";
      this.eleDivVideoOpts.classList.remove("p51-display-none");
    } else {
      this.eleDivVideoOpts.style.opacity = "0.0";
      this.eleDivVideoOpts.classList.add("p51-display-none");
      if (this.player.options.thumbnail) {
        this.eleDivVideoOpts.remove();
      }
    }
    this._updateOverlayOptionVisibility();
  }

  _updateOverlayOptionVisibility() {
    this.eleOptCtlShowAttrWrapper.classList.toggle(
      "hidden",
      !this._overlayHasDetectionAttrs
    );
    this.attrOptsElements.forEach((e) =>
      e.classList.toggle(
        "hidden",
        !this._overlayHasDetectionAttrs || !this.overlayOptions.showAttrs
      )
    );
    for (const [key, wrapper] of Object.entries(this._overlayOptionWrappers)) {
      if (this.options.enableOverlayOptions[key] === false) {
        wrapper.classList.add("hidden");
      }
    }
  }
}
