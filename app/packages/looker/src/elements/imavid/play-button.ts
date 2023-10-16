import { ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { bufferingCircle, bufferingPath } from "../video.module.css";

// controls element: not shown in grid (thumbnail = off)
export class PlayButtonElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  private isPlaying: boolean;
  private isBuffering: boolean;
  private play: SVGElement;
  private pause: SVGElement;
  private buffering: SVGElement;
  private locked: boolean = null;
  private singleFrame: boolean = null;

  getEvents(): Events<ImaVidState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.preventDefault();
        event.stopPropagation();
        playPause.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    this.pause = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.pause.setAttribute("height", "24");
    this.pause.setAttribute("width", "24");
    this.pause.setAttribute("viewBox", "0 0 24 24");

    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "var(--fo-palette-text-secondary)");
    path.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    this.pause.appendChild(path);

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");
    this.pause.appendChild(path);

    this.play = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.play.setAttribute("height", "24");
    this.play.setAttribute("width", "24");
    this.play.setAttribute("viewBox", "0 0 24 24");

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "rgb(238, 238, 238)");
    path.setAttribute("d", "M8 5v14l11-7z");
    this.play.appendChild(path);
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");

    this.buffering = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    this.buffering.classList.add(bufferingCircle);
    this.buffering.setAttribute("viewBox", "12 12 24 24");
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", "24");
    circle.setAttribute("cy", "24");
    circle.setAttribute("r", "9");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("stroke", "rgb(238, 238, 238)");
    circle.setAttribute("fill", "none");
    circle.classList.add(bufferingPath);
    this.buffering.appendChild(circle);

    const element = document.createElement("div");
    element.style.marginTop = "2px";
    element.style.position = "relative";
    element.style.height = "24px";
    element.style.width = "24px";
    element.style.gridArea = "2 / 2 / 2 / 2";
    return element;
  }

  renderSelf({
    playing,
    buffering,
    loaded,
    duration,
    config: { thumbnail },
  }: Readonly<ImaVidState>) {
    let updatePlay = false;
    if (
      playing !== this.isPlaying ||
      this.isBuffering !== buffering ||
      !loaded
    ) {
      this.element.innerHTML = "";
      if (buffering || !loaded) {
        this.element.appendChild(this.buffering);
        this.element.title = "Loading";
        this.element.style.cursor = "default";
      } else if (playing) {
        this.element.appendChild(this.pause);
        this.element.title = "Pause (space)";
        this.element.style.cursor = "pointer";
      } else {
        this.element.appendChild(this.play);
        this.element.title = "Play (space)";
        this.element.style.cursor = "pointer";
        this.element.setAttribute("data-cy", "looker-video-play-button");
      }
      this.isPlaying = playing;
      this.isBuffering = buffering || !loaded;
    }

    if (updatePlay) {
      const path = this.play.children[0];
      path.setAttribute(
        "fill",
        this.singleFrame
          ? "var(--fo-palette-text-tertiary)"
          : "var(--fo-palette-text-secondary)"
      );
      this.element.style.cursor = this.singleFrame ? "unset" : "pointer";
      this.element.title = this.singleFrame ? "Only one frame" : "Play (space)";
    }
    return this.element;
  }
}
