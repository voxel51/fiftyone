/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import mime from "mime";

import { BaseState, Sample } from "../../state";
import { BaseElement } from "../base";

import { lookerErrorPage } from "./error.module.css";
import errorIcon from "../../icons/error.svg";

export class ErrorElement<State extends BaseState> extends BaseElement<State> {
  private errorElement: HTMLDivElement = null;

  createHTMLElement() {
    return null;
  }

  renderSelf(
    { error, config: { thumbnail } }: Readonly<State>,
    sample: Sample
  ) {
    if (error && !this.errorElement) {
      this.errorElement = document.createElement("div");
      this.errorElement.classList.add(lookerErrorPage);
      const errorImg = document.createElement("img");
      errorImg.src = errorIcon;
      this.errorElement.appendChild(errorImg);

      if (!thumbnail) {
        const mimetype = getMimeType(sample);
        const isVideo = mimetype.startsWith("video/");
        const text = document.createElement("p");
        const textDiv = document.createElement("div");
        text.innerText = `This ${
          isVideo ? "video" : "image"
        } failed to load. The file may not
        exist, or its type (${mimetype}) may be unsupported.`;
        textDiv.appendChild(text);

        if (isVideo) {
          const videoText = document.createElement("p");
          videoText.innerHTML = `You can use
            <code>
              <a href="https://voxel51.com/docs/fiftyone/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos">
                fiftyone.utils.video.reencode_videos()
              </a>
            </code>
            to re-encode videos in a supported format.`;
        }

        this.errorElement.appendChild(textDiv);
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

const getMimeType = (sample: any) => {
  return (
    (sample.metadata && sample.metadata.mime_type) ||
    mime.getType(sample.filepath) ||
    "image/jpg"
  );
};

const isElectron = (): boolean => {
  return (
    window.process &&
    window.process.versions &&
    Boolean(window.process.versions.electron)
  );
};
