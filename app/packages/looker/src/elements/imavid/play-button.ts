import { Control, ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { bufferingCircle, bufferingPath } from "../video.module.css";

export const playPause: Control<ImaVidState> = {
  title: "Play / pause",
  shortcut: "Space",
  eventKeys: " ",
  detail: "Play or pause the video",
  action: (update, dispatchEvent) => {
    update(
      ({
        currentFrameNumber,
        playing,
        config: { frameStoreController, thumbnail },
      }) => {
        if (thumbnail) {
          return {};
        }

        dispatchEvent("options", { showJSON: false });

        // todo: figure out why setting frame number to 1 doesn't restart playback because of drawFrame
        return {
          playing: !playing,
          frameNumber:
            currentFrameNumber === frameStoreController.totalFrameCount
              ? 1
              : currentFrameNumber,
          options: { showJSON: false },
        };
      }
    );
  },
};
export class PlayButtonElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  private isPlaying: boolean;
  private isBuffering: boolean;
  private play: SVGElement;
  private pause: SVGElement;
  private buffering: SVGElement;

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

    element.setAttribute("data-cy", "looker-video-play-button");

    return element;
  }

  renderSelf({ playing, buffering, loaded }: Readonly<ImaVidState>) {
    if (
      playing !== this.isPlaying ||
      this.isBuffering !== buffering ||
      !loaded
    ) {
      this.element.innerHTML = "";
      if (!loaded) {
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
      }
      this.isPlaying = playing;
      this.isBuffering = !loaded;
    }

    return this.element;
  }
}
