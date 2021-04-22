/**
 * Copyright 2017-2021, Voxel51, Inc.
 */


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

  abstract class PlayerElement {
      children: PlayerElement[] = [];
      
      abstract constructor()

      abstract render(options): Element

      abstract active(options): boolean

      abstract update(options): void
  }

  class PlayerBase extends PlayerElement {

    children = [
        
    ]
  }
  
  Renderer.prototype.initSharedControls = function () {
    if (this.eleOptionsButton) {
      this.initPlayerOptionsControls();
    }
  };
  
  Renderer.prototype.initPlayerControlHTML = function (parent, sequence = true) {
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
  };
  
  Renderer.prototype.initPlayerControlsPlayButtonHTML = function (parent) {
    this.elePlayPauseButton = document.createElement("img");
    this.elePlayPauseButton.className = "p51-clickable";
    this.elePlayPauseButton.style.gridArea = "2 / 2 / 2 / 2";
    this.updatePlayButton(false);
    parent.appendChild(this.elePlayPauseButton);
  };
  
  Renderer.prototype.initPlayerControlsSeekBarHTML = function (parent) {
    this.eleSeekBar = document.createElement("input");
    this.eleSeekBar.setAttribute("type", "range");
    this.eleSeekBar.setAttribute("value", "0");
    this.eleSeekBar.setAttribute("min", "0");
    this.eleSeekBar.setAttribute("max", this.seekBarMax.toString());
    this.eleSeekBar.className = "p51-seek-bar";
    this.eleSeekBar.style.gridArea = "1 / 2 / 1 / 6";
    parent.appendChild(this.eleSeekBar);
  };

const base = {

    initCanvas: (parent) => {
        const eleDivCanvas = document.createElement("div");
        eleDivCanvas.className = "p51-contained-canvas";
        this.eleCanvas = document.createElement("canvas");
        this.eleCanvas.className = "p51-contained-canvas";
        this.eleDivCanvas.appendChild(this.eleCanvas);
        parent.appendChild(this.eleDivCanvas);
      };
    initPlayerOptionsPanelHTML = function (parent) {
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
        this.eleOptCtlShowAttrClickWrapper = makeWrapper([eleOptCtlShowAttrClickRow]);
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
    
}

const video = {
    initTimeStampHTML: (parent) => {
        const eleTimeStamp = document.createElement("div");
        eleTimeStamp.className = "p51-time";
        eleTimeStamp.style.gridArea = "2 / 3 / 2 / 3";
        parent.appendChild(this.eleTimeStamp);
        return eleTimeStamp;
      },

      initPlayerControlOptionsButtonHTML: (parent) => {
        const eleOptionsButton = document.createElement("img");
        eleOptionsButton.className = "p51-clickable";
        eleOptionsButton.src = ICONS.options;
        eleOptionsButton.title = "Settings (s)";
        eleOptionsButton.style.gridArea = "2 / 5 / 2 / 5";
        parent.appendChild(this.eleOptionsButton);
        return eleOptionsButton;
      }
}

  
  Renderer.prototype.initPlayerOptionsControls = function () {
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
  };
  
  Renderer.prototype._alterOptionsLabelText = function () {
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
  };
  
  Renderer.prototype.checkMouseOnControls = function (e) {
    if (this.eleDivVideoControls && this.eleDivVideoControls.contains(e.target)) {
      return true;
    } else if (this.eleDivVideoOpts && this.eleDivVideoOpts.contains(e.target)) {
      return true;
    }
    return false;
  };
  
  Renderer.prototype.updateControlsDisplayState = function () {
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
  };
  
  Renderer.prototype._updateOptionsDisplayState = function () {
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
  };
  
  Renderer.prototype._updateOverlayOptionVisibility = function () {
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
  };
  
  Renderer.prototype.updatePlayButton = function (playing) {
    if (this.elePlayPauseButton) {
      if (playing) {
        this.elePlayPauseButton.src = ICONS.pause;
        this.elePlayPauseButton.title = "Pause (space)";
      } else {
        this.elePlayPauseButton.src = ICONS.play;
        this.elePlayPauseButton.title = "Play (space)";
      }
    }
  };
  
  Renderer.prototype.updateTimeStamp = function (timeStr) {
    if (!this.eleTimeStamp) {
      return;
    }
    this.eleTimeStamp.innerHTML = timeStr;
  };