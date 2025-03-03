import { BaseConfig, BaseState, DispatchEvent, Sample } from "../../state";
import { BaseElement } from "../base";
import { getFileName, getFileSize, getIcon } from "./util";

export class MetadataThumbnailElement extends BaseElement<BaseState> {
  // Used to scale content as size of looker changes.
  // These values have no meaning aside from being a size at which the content
  // looks reasonable.
  readonly #targetWidth = 225;
  readonly #targetHeight = 225;

  #container: HTMLElement;
  #icon: HTMLImageElement;
  #fileName: HTMLElement;
  #fileSize: HTMLElement;

  createHTMLElement(
    dispatchEvent: DispatchEvent,
    config: Readonly<BaseConfig>
  ): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "file-thumbnail-looker");

    element.style.backgroundColor = "var(--fo-palette-background-header)";
    element.style.height = "100%";
    element.style.display = "grid";
    element.style.placeContent = "center";

    this.#container = document.createElement("div");
    this.#container.style.display = "grid";
    this.#container.style.gridTemplateRows = "1fr 1fr 1fr";
    this.#container.style.rowGap = "1.5em";
    this.#container.style.justifyItems = "center";
    this.#container.style.alignItems = "center";

    element.appendChild(this.#container);

    this.#icon = document.createElement("img");
    this.#icon.style.fontSize = "1.5em";

    this.#fileName = document.createElement("div");
    this.#fileName.style.fontSize = "1.5em";
    this.#fileName.style.fontWeight = "bold";

    this.#fileSize = document.createElement("div");
    this.#fileSize.style.color = "var(--fo-palette-text-secondary)";

    this.#container.appendChild(this.#icon);
    this.#container.appendChild(this.#fileName);
    this.#container.appendChild(this.#fileSize);

    return element;
  }

  renderSelf(
    state: Readonly<BaseState>,
    sample: Readonly<Sample>
  ): HTMLElement {
    this.#handleIcon(state, sample);
    this.#handleFileName(sample);
    this.#handleFileSize(sample);
    this.#handleScaling(state);

    return this.element;
  }

  #handleScaling(state: Readonly<BaseState>) {
    this.#container.style.scale = `${this.#getScaleFactor(
      state.windowBBox[2],
      state.windowBBox[3]
    )}`;
  }

  #getScaleFactor(width: number, height: number): number {
    return Math.min(width / this.#targetWidth, height / this.#targetHeight);
  }

  #handleIcon(state: Readonly<BaseState>, sample: Readonly<Sample>) {
    this.#icon.src = getIcon(sample.filepath);

    if (state.hovering) {
      // We can't control the color of our SVG directly, so we need to apply
      // a CSS filter to get what we want.
      // Credit to https://codepen.io/sosuke/pen/Pjoqqp for this filter.
      this.#icon.style.filter =
        "brightness(0) saturate(100%) invert(48%) sepia(57%) saturate(2369%) hue-rotate(354deg) brightness(99%) contrast(107%)";
    } else {
      this.#icon.style.filter = "none";
    }
  }

  #handleFileName(sample: Readonly<Sample>) {
    this.#fileName.innerText = getFileName(sample.filepath);
  }

  #handleFileSize(sample: Readonly<Sample>) {
    this.#fileSize.innerText = getFileSize(sample);
  }
}
