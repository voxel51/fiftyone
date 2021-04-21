import EventTarget from "@ungap/event-target";
import { ClassificationsOverlay, FROM_FO } from "../overlay.js";
import { ICONS, rescale } from "../util.js";

const clearCanvas = (canvas, canvasWidth, canvasHeight) => {
  canvas.getContext("2d").clearRect(0, 0, canvasWidth, canvasHeight);
};

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

  prepareOverlay() {
    const context = this.setupCanvasContext();

    const classifications = [];
    for (const field in this.sample) {
      const label = this.sample[field];
      if (!label) {
        continue;
      }
      if (label._cls in FROM_FO) {
        const overlays = FROM_FO[label._cls](field, label, this);
        overlays.forEach((o) =>
          o.setup(context, this.canvasWidth, this.canvasHeight)
        );
        this._overlays = [...this._overlays, ...overlays];
      } else if (label._cls === "Classification") {
        classifications.push([field, [null, [label]]]);
      } else if (label._cls === "Classifications") {
        classifications.push([field, [null, label.classifications]]);
      }
    }

    if (classifications.length > 0) {
      const overlay = new ClassificationsOverlay(classifications, this);
      overlay.setup(context, this.canvasWidth, this.canvasHeight);
      this._overlays.push(overlay);
    }
    this._updateOverlayOptionVisibility();
    this._reBindMouseHandler();

    this.updateFromLoadingState();
    this.updateFromDynamicState();
  }

  private getOrderedOverlays(coords) {
    if (this._orderedOverlayCache) {
      return this._orderedOverlayCache;
    }
    const overlays = this._overlays;

    if (!overlays) {
      return [];
    }

    const activeLabels = this.options.activeLabels;

    const bins = Object.fromEntries(activeLabels.map((l) => [l, []]));
    let classifications = null;

    for (const overlay of overlays) {
      if (overlay instanceof ClassificationsOverlay) {
        classifications = overlay;
        continue;
      }

      if (!(overlay.field in bins)) continue;

      bins[overlay.field].push(overlay);
    }

    let ordered = activeLabels.reduce((acc, cur) => [...acc, ...bins[cur]], []);

    if (classifications) {
      ordered = [classifications, ...ordered];
    }

    return this._setTopOverlays(coords, ordered);
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

  private setTopOverlays({ x, y }, overlays) {
    if (
      this.player.options.thumbnail ||
      [-1, null].includes(x) ||
      [-1, null].includes(y)
    ) {
      return overlays;
    }

    if (!overlays || !overlays.length) {
      return overlays;
    }

    const contained = overlays
      .filter((o) => o.containsPoint(x, y) > 0)
      .sort((a, b) => a.getMouseDistance(x, y) - b.getMouseDistance(x, y));
    const outside = overlays.filter(
      (o) => o instanceof ClassificationsOverlay || o.containsPoint(x, y) === 0
    );

    return [...contained, ...outside];
  }

  private renderRest() {
    if (this.overlayOptions.labelsOnlyOnClick) {
      return !this._focusedObject;
    }
    return true;
  }

  isFocus(overlayObj) {
    return (
      this._focusedObject === overlayObj ||
      overlayObj.index === this._focusIndex
    );
  }

  setFocus(overlayObj, position = undefined) {
    if (!this._canFocus) {
      overlayObj = position = undefined;
    }
    if (position) {
      this._focusPos = position;
    }
    if (this._focusedObject !== overlayObj) {
      this._focusedObject = overlayObj;
      if (overlayObj === undefined) {
        this._focusedObject = undefined;
        this._focusIndex = -1;
      } else {
        this._focusIndex =
          overlayObj.index !== undefined ? overlayObj.index : -1;
      }
      return true;
    }
    return false;
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

  setupCanvasContext() {
    if (!this._isRendered) {
      /* eslint-disable-next-line no-console */
      console.log(
        "WARN: trying to set up canvas context but player not rendered"
      );
      return;
    }
    const canvasContext = this.eleCanvas.getContext("2d");
    canvasContext.strokeStyle = "#fff";
    canvasContext.fillStyle = "#fff";
    canvasContext.lineWidth = 3;
    canvasContext.font = "14px sans-serif";
    // easier for setting offsets
    canvasContext.textBaseline = "bottom";
    return canvasContext;
  }

  initSharedControls() {
    if (this.eleOptionsButton) {
      this.initPlayerOptionsControls();
    }
  }

  initPlayerControlHTML(parent, sequence = true) {
    this.eleDivVideoControls = document.createElement("div");
    this.eleDivVideoControls.className = "p51-video-controls";
    if (sequence) {
      this.initPlayerControlsPlayButtonHTML(this.eleDivVideoControls);
      this.initPlayerControlsSeekBarHTML(this.eleDivVideoControls);
    }
    this.initPlayerControlOptionsButtonHTML(this.eleDivVideoControls);
    this.initTimeStampHTML(this.eleDivVideoControls);
    this.eleDivVideoControls.addEventListener("click", () => {
      this._boolShowControls = false;
      this._boolDisableShowControls = true;
      this.updateControlsDisplayState();
    });
    const hideTooltip = () => {
      this.overlayOptions.showTooltip &&
        this.dispatchEvent("tooltipinfo", {
          data: {
            overlays: [],
            point: [0, 0],
          },
        });
    };
    this.eleDivVideoControls.addEventListener("mouseenter", () => {
      this._boolHoveringControls = true;
      hideTooltip();
    });
    this.eleDivVideoControls.addEventListener("mouseleave", () => {
      this._boolHoveringControls = false;
    });
    parent.appendChild(this.eleDivVideoControls);
    this.initPlayerOptionsPanelHTML(parent);
  }

  initPlayerControlOptionsButtonHTML(parent) {
    this.eleOptionsButton = document.createElement("img");
    this.eleOptionsButton.className = "p51-clickable";
    this.eleOptionsButton.src = ICONS.options;
    this.eleOptionsButton.title = "Settings (s)";
    this.eleOptionsButton.style.gridArea = "2 / 5 / 2 / 5";
    parent.appendChild(this.eleOptionsButton);
  }

  initPlayerOptionsPanelHTML(parent) {
    this.eleDivVideoOpts = document.createElement("div");
    this.eleDivVideoOpts.className = "p51-video-options-panel";
    const hideTooltip = () => {
      this.overlayOptions.showTooltip &&
        this.dispatchEvent("tooltipinfo", {
          data: {
            overlays: [],
            point: [0, 0],
          },
        });
    };
    this.eleDivVideoOpts.addEventListener("mouseenter", () => {
      this._boolHoveringControls = true;
      hideTooltip();
    });
    this.eleDivVideoOpts.addEventListener(
      "mouseleave",
      () => (this._boolHoveringControls = false)
    );

    const makeSectionHeader = function (text) {
      const header = document.createElement("b");
      header.className = "p51-section-header";
      header.innerText = text;
      return header;
    };

    const makeWrapper = function (children) {
      const wrapper = document.createElement("div");
      wrapper.className = "p51-video-opt-input";
      for (const child of children) {
        wrapper.appendChild(child);
      }
      return wrapper;
    };

    const makeCheckboxRow = function (text, checked) {
      const label = document.createElement("label");
      label.className = "p51-label";
      label.innerHTML = text;

      const checkbox = document.createElement("input");
      checkbox.setAttribute("type", "checkbox");
      checkbox.checked = checked;
      const span = document.createElement("span");
      span.className = "p51-checkbox";
      label.appendChild(checkbox);
      label.appendChild(span);

      return label;
    };

    // Checkbox to show frames instead of time
    const eleOptCtlFrameCountRow = makeCheckboxRow(
      "Show frame number",
      this.overlayOptions.showFrameCount
    );
    this.eleOptCtlShowFrameCount = eleOptCtlFrameCountRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowFrameCountWrapper = makeWrapper([eleOptCtlFrameCountRow]);
    this._overlayOptionWrappers.showFrameCount = this.eleOptCtlShowFrameCountWrapper;

    // Checkbox for show label on click only
    const eleOptCtlShowLabelRow = makeCheckboxRow(
      "Only show clicked object",
      this.overlayOptions.labelsOnlyOnClick
    );
    this.eleOptCtlShowLabel = eleOptCtlShowLabelRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowLabelWrapper = makeWrapper([eleOptCtlShowLabelRow]);
    this._overlayOptionWrappers.labelsOnlyOnClick = this.eleOptCtlShowLabelWrapper;

    // Selection for action type
    this.eleActionCtlOptForm = document.createElement("form");
    this.eleActionCtlOptForm.className = "p51-video-opt-input";
    const actionFormTitle = document.createElement("div");
    actionFormTitle.appendChild(makeSectionHeader("Object selection mode"));
    this.eleActionCtlOptForm.appendChild(actionFormTitle);
    this.eleActionCtlOptForm.appendChild(document.createElement("div"));
    for (const [key, obj] of Object.entries(this._actionOptions)) {
      const radio = document.createElement("input");
      radio.setAttribute("type", "radio");
      radio.name = "selectActionOpt";
      radio.value = key;
      radio.checked = this.overlayOptions.action === key;
      const label = document.createElement("label");
      label.innerHTML = obj.name;
      label.className = "p51-label";
      label.appendChild(radio);
      const span = document.createElement("span");
      span.className = "p51-radio";
      label.appendChild(span);
      this.eleActionCtlOptForm.appendChild(label);
    }
    this._overlayOptionWrappers.action = this.eleActionCtlOptForm;

    // Checkbox for show attrs
    const eleOptCtlShowAttrRow = makeCheckboxRow(
      "Show attributes",
      this.overlayOptions.showAttrs
    );
    this.eleOptCtlShowAttr = eleOptCtlShowAttrRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowAttrWrapper = makeWrapper([eleOptCtlShowAttrRow]);
    this._overlayOptionWrappers.showAttrs = this.eleOptCtlShowAttrWrapper;

    // Checkbox for show confidence
    const eleOptCtlShowConfidenceRow = makeCheckboxRow(
      "Show confidence",
      this.overlayOptions.showConfidence
    );
    this.eleOptCtlShowConfidence = eleOptCtlShowConfidenceRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowConfidenceWrapper = makeWrapper([
      eleOptCtlShowConfidenceRow,
    ]);
    this._overlayOptionWrappers.showConfidence = this.eleOptCtlShowConfidenceWrapper;

    // Checkbox for show tooltip
    const eleOptCtlShowTooltipRow = makeCheckboxRow(
      "Show tooltip",
      this.overlayOptions.showTooltip
    );
    this.eleOptCtlShowTooltip = eleOptCtlShowTooltipRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowTooltipWrapper = makeWrapper([eleOptCtlShowTooltipRow]);
    this._overlayOptionWrappers.showTooltip = this.eleOptCtlShowTooltipWrapper;

    // Checkbox for show attrs on click only
    const eleOptCtlShowAttrClickRow = makeCheckboxRow(
      "Only show clicked attributes",
      this.overlayOptions.attrsOnlyOnClick
    );
    this.eleOptCtlShowAttrClick = eleOptCtlShowAttrClickRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlShowAttrClickWrapper = makeWrapper([
      eleOptCtlShowAttrClickRow,
    ]);
    this._overlayOptionWrappers.attrsOnlyOnClick = this.eleOptCtlShowAttrClickWrapper;

    // Checkbox for rendering background for attr text
    const eleOptCtlAttrBoxRow = makeCheckboxRow(
      "Show attribute background",
      this.overlayOptions.attrRenderBox
    );
    this.eleOptCtlShowAttrBox = eleOptCtlAttrBoxRow.querySelector(
      "input[type=checkbox]"
    );
    this.eleOptCtlAttrBoxWrapper = makeWrapper([eleOptCtlAttrBoxRow]);
    this._overlayOptionWrappers.attrRenderBox = this.eleOptCtlAttrBoxWrapper;

    // Radio for how to show attrs
    this.eleOptCtlAttrOptForm = document.createElement("form");
    this.eleOptCtlAttrOptForm.className = "p51-video-opt-input";
    const formTitle = document.createElement("div");
    formTitle.appendChild(makeSectionHeader("Object attribute mode"));
    this.eleOptCtlAttrOptForm.appendChild(formTitle);
    this.eleOptCtlAttrOptForm.appendChild(document.createElement("div"));
    for (const item of this._attrRenderModeOptions) {
      const radio = document.createElement("input");
      radio.setAttribute("type", "radio");
      radio.name = "attrRenderOpt";
      radio.value = item.value;
      radio.checked = this.overlayOptions.attrRenderMode === item.value;
      const label = document.createElement("label");
      label.innerHTML = item.name;
      label.className = "p51-label";
      label.appendChild(radio);
      const span = document.createElement("span");
      span.className = "p51-radio";
      label.appendChild(span);
      this.eleOptCtlAttrOptForm.appendChild(label);
    }
    this._overlayOptionWrappers.attrRenderMode = this.eleOptCtlAttrOptForm;

    if (this.hasFrameNumbers()) {
      this.eleDivVideoOpts.appendChild(this.eleOptCtlShowFrameCountWrapper);
    }
    this.eleDivVideoOpts.appendChild(this.eleActionCtlOptForm);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlShowLabelWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlShowAttrWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlShowAttrClickWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlShowConfidenceWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlShowTooltipWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlAttrBoxWrapper);
    this.eleDivVideoOpts.appendChild(this.eleOptCtlAttrOptForm);

    this.attrOptsElements = [
      this.eleOptCtlAttrOptForm,
      this.eleOptCtlAttrBoxWrapper,
      this.eleOptCtlShowAttrClickWrapper,
    ];

    parent.appendChild(this.eleDivVideoOpts);

    // set up initial visibility of attribute options
    this._updateOverlayOptionVisibility();
    this._alterOptionsLabelText();
  }

  _repositionOptionsPanel() {
    // account for control bar height and any padding
    this.eleDivVideoOpts.style.bottom =
      this.eleDivVideoControls.clientHeight +
      parseInt(this.paddingBottom) +
      4 +
      "px";
    this.eleDivVideoOpts.style.right = parseInt(this.paddingRight) + "px";
  }

  initPlayerOptionsControls() {
    this.eleOptionsButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this._boolShowVideoOptions = !this._boolShowVideoOptions;
      this._repositionOptionsPanel();
      this.updateFromDynamicState();
    });

    const hideOptions = (e) => {
      if (
        this._boolShowVideoOptions &&
        !this.eleDivVideoOpts.contains(e.target) &&
        !this.eleOptionsButton.contains(e.target)
      ) {
        this._boolShowVideoOptions = false;
        this.updateFromDynamicState();
      }
    };
    this.eleDivCanvas.addEventListener("click", hideOptions);
    this.eleDivVideoControls.addEventListener("click", hideOptions);

    const enableFocus = () => {
      this._canFocus = true;
    };
    const disableFocus = () => {
      this._canFocus = false;
      this._mouseX = null;
      this._mouseY = null;
      this._orderedOverlayCache = null;
      this._focusPos = { x: -1, y: -1 };
      this.setFocus(undefined);
      this.processFrame();
    };
    const hideTooltip = () => {
      this.overlayOptions.showTooltip &&
        this.dispatchEvent("tooltipinfo", {
          data: {
            overlays: [],
            point: [0, 0],
          },
        });
    };
    this.eleCanvas.addEventListener("mouseenter", () => enableFocus);
    this.eleDivCanvas.addEventListener("mouseenter", () => {
      enableFocus();
      document.body.addEventListener("keydown", this._handleMouseEvent);
    });
    this.eleCanvas.addEventListener("mouseleave", disableFocus);
    this.eleDivCanvas.addEventListener("mouseleave", () => {
      disableFocus();
      document.body.removeEventListener("keydown", this._handleMouseEvent);
      hideTooltip();
    });
    this.eleDivVideoControls.addEventListener("mouseenter", disableFocus);

    this.eleOptCtlShowFrameCount.addEventListener("change", () => {
      this.overlayOptions.showFrameCount = this.eleOptCtlShowFrameCount.checked;
      this.processFrame();
    });

    this.eleOptCtlShowLabel.addEventListener("change", () => {
      this.overlayOptions.labelsOnlyOnClick = this.eleOptCtlShowLabel.checked;
      this.processFrame();
      this.updateFromDynamicState();
    });

    const dispatchOptionsChange = () => {
      this.dispatchEvent("options", { data: this.overlayOptions });
    };

    this.eleOptCtlShowAttr.addEventListener("change", () => {
      this.overlayOptions.showAttrs = this.eleOptCtlShowAttr.checked;
      dispatchOptionsChange();
      this.processFrame();
      this.updateFromDynamicState();
      this._repositionOptionsPanel();
    });

    this.eleOptCtlShowAttrClick.addEventListener("change", () => {
      this.overlayOptions.attrsOnlyOnClick = this.eleOptCtlShowAttrClick.checked;
      this.processFrame();
      this.updateFromDynamicState();
    });

    this.eleOptCtlShowAttrBox.addEventListener("change", () => {
      this.overlayOptions.attrRenderBox = this.eleOptCtlShowAttrBox.checked;
      this.processFrame();
      this.updateFromDynamicState();
    });

    this.eleOptCtlShowConfidence.addEventListener("change", () => {
      this.overlayOptions.showConfidence = this.eleOptCtlShowConfidence.checked;
      dispatchOptionsChange();
      this.processFrame();
      this.updateFromDynamicState();
    });

    this.eleOptCtlShowTooltip.addEventListener("change", () => {
      this.overlayOptions.showTooltip = this.eleOptCtlShowTooltip.checked;
      dispatchOptionsChange();
      this.processFrame();
      this.updateFromDynamicState();
    });

    for (const radio of this.eleOptCtlAttrOptForm) {
      radio.addEventListener("change", () => {
        if (radio.value !== this.overlayOptions.attrRenderMode) {
          this.overlayOptions.attrRenderMode = radio.value;
          this._alterOptionsLabelText();
          this.processFrame();
          this.updateFromDynamicState();
        }
      });
    }

    for (const radio of this.eleActionCtlOptForm) {
      radio.addEventListener("change", () => {
        if (radio.value !== this.overlayOptions.action) {
          this.overlayOptions.action = radio.value;
          this._alterOptionsLabelText();
          this._reBindMouseHandler();
          this.processFrame();
          this.updateFromDynamicState();
        }
      });
    }
  }

  _alterOptionsLabelText() {
    const getTextNode = (nodes) => {
      for (const node of nodes) {
        if (node.nodeName === "#text") {
          return node;
        }
      }
    };
    let textNode = getTextNode(
      this.eleOptCtlShowAttrClickWrapper.querySelector("label").childNodes
    );
    textNode.textContent =
      "Only show " +
      `${this._actionOptions[this.overlayOptions.action].labelText} attributes`;

    textNode = getTextNode(
      this.eleOptCtlShowLabelWrapper.querySelector("label").childNodes
    );
    textNode.textContent =
      "Only show " +
      `${this._actionOptions[this.overlayOptions.action].labelText} object`;
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
