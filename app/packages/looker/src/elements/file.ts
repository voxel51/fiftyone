import { BaseElement } from "./base";
import { BaseConfig, BaseState, DispatchEvent, Sample } from "../state";
import { humanReadableBytes } from "@fiftyone/utilities";
import codeIcon from "../icons/code.svg";
import documentIcon from "../icons/document.svg";
import findInPageIcon from "../icons/findInPage.svg";
import tableViewIcon from "../icons/tableView.svg";
import terminalIcon from "../icons/terminal.svg";

const defaultIcon = documentIcon;
const iconMapping: { [extension: string]: string } = {
  html: codeIcon,
  xml: codeIcon,
  xhtml: codeIcon,
  log: findInPageIcon,
  csv: tableViewIcon,
  py: terminalIcon,
};

const getFileExtension = (path: string): string | undefined => {
  if (path.includes(".")) {
    return path.split(".").slice(-1)[0];
  } else {
    return undefined;
  }
};

const getIcon = (path: string): string => {
  const extension = getFileExtension(path);
  if (!extension || !iconMapping[extension]) {
    return defaultIcon;
  }
  return iconMapping[extension];
};

/**
 * Element which renders metadata and/or file content for a non-visual sample.
 */
export class FileElement extends BaseElement<BaseState> {
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
    element.setAttribute("data-cy", "file-looker");

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
    this.#handleScaling(state);
    this.#handleIcon(state, sample);
    this.#handleFileName(sample);
    this.#handleFileSize(sample);

    return this.element;
  }

  #handleScaling(state: Readonly<BaseState>) {
    this.#container.style.scale = `${this.#getScaleFactor(
      state.windowBBox[2],
      state.windowBBox[3]
    )}`;
  }

  #handleIcon(state: Readonly<BaseState>, sample: Readonly<Sample>) {
    this.#icon.src = getIcon(sample.filepath);

    if (state.hovering || !state.config.thumbnail) {
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
    if (sample.filepath.includes("/")) {
      this.#fileName.innerText = sample.filepath.split("/").slice(-1)[0];
    } else {
      this.#fileName.innerText = sample.filepath;
    }
  }

  #handleFileSize(sample: Readonly<Sample>) {
    if (sample.metadata?.size_bytes) {
      this.#fileSize.innerText = humanReadableBytes(sample.metadata.size_bytes);
    } else {
      this.#fileSize.innerText = "Unknown file size";
    }
  }

  #getScaleFactor(width: number, height: number): number {
    return Math.min(width / this.#targetWidth, height / this.#targetHeight);
  }
}
