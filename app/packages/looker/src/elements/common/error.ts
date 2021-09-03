/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement } from "../base";

import { lookerErrorPage } from "./error.module.css";
import errorIcon from "../../icons/error.svg";

export class ErrorElement<State extends BaseState> extends BaseElement<State> {
  private errorElement: HTMLDivElement = null;

  createHTMLElement() {
    return null;
  }

  renderSelf({
    error,
    config: { thumbnail },
    options: { mimetype },
  }: Readonly<State>) {
    if (error && !this.errorElement) {
      this.errorElement = document.createElement("div");
      this.errorElement.classList.add(lookerErrorPage);
      const errorImg = document.createElement("img");
      errorImg.src = errorIcon;
      this.errorElement.appendChild(errorImg);

      if (!thumbnail) {
        const isVideo = mimetype.startsWith("video/");
        const text = document.createElement("p");
        const textDiv = document.createElement("div");
        text.innerText = `This ${
          isVideo ? "video" : "image"
        } failed to load. The file may not exist, or its type (${mimetype}) may be unsupported.`;
        textDiv.appendChild(text);

        this.errorElement.appendChild(textDiv);

        if (isVideo) {
          const videoText = document.createElement("p");
          videoText.innerHTML = `You can use
            <code>
              <a>
                fiftyone.utils.video.reencode_videos()
              </a>
            </code>
            to re-encode videos in a supported format.`;
          videoText
            .querySelector("a")
            .addEventListener("click", () =>
              onClick(
                "https://voxel51.com/docs/fiftyone/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos"
              )
            );
          textDiv.appendChild(videoText);
        }
      } else {
        this.errorElement.style.cursor = "pointer";
      }
    }
    return this.errorElement;
  }
}

const onClick = (href) => {
  let openExternal;
  if (isElectron()) {
    try {
      openExternal = require("electron").shell.openExternal;
    } catch {}
  }

  return openExternal
    ? (e) => {
        e.preventDefault();
        openExternal(href);
      }
    : null;
};

const isElectron = (): boolean => {
  return (
    window.process &&
    window.process.versions &&
    Boolean(window.process.versions.electron)
  );
};
