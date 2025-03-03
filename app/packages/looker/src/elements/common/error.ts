/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import copy from "copy-to-clipboard";

import { BaseState } from "../../state";
import { BaseElement } from "../base";

import { AppError } from "@fiftyone/utilities";
import errorIcon from "../../icons/error.svg";
import refreshIcon from "../../icons/refresh.svg";
import { lookerErrorPage } from "./error.module.css";

export class ErrorElement<State extends BaseState> extends BaseElement<State> {
  private errorElement: HTMLDivElement = null;
  private reset: () => void;

  createHTMLElement(dispatchEvent: (eventType: string, details?: any) => void) {
    this.reset = () => {
      dispatchEvent("reset");
    };
    return null;
  }

  renderSelf({
    error,
    config: { thumbnail },
    options: { mimetype },
  }: Readonly<State>) {
    if (error && !this.errorElement) {
      this.errorElement = document.createElement("div");
      this.errorElement.setAttribute("data-cy", "looker-error-info");
      this.errorElement.classList.add(lookerErrorPage);
      const errorImg = document.createElement("img");
      errorImg.addEventListener("mouseenter", () => {
        errorImg.src = refreshIcon;
      });
      errorImg.addEventListener("mouseleave", () => {
        errorImg.src = errorIcon;
      });
      errorImg.src = errorIcon;
      errorImg.title = "Click to reload";
      errorImg.style.cursor = "pointer";
      errorImg.addEventListener("click", (e) => {
        e.stopPropagation();
        this.reset();
      });
      this.errorElement.appendChild(errorImg);

      if (!thumbnail) {
        if (error === true) {
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
                <a
                  href="https://docs.voxel51.com/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos"
                  target="_blank"
                >
                  fiftyone.utils.video.reencode_videos()
                </a>
              </code>
              to re-encode videos in a supported format.`;
            textDiv.appendChild(videoText);
          }
        } else {
          const text = document.createElement("p");
          const textDiv = document.createElement("div");
          text.innerText =
            "Something went wrong" +
            (error["message"] ? `: ${error["message"]}` : ".");
          textDiv.appendChild(text);
          this.errorElement.appendChild(textDiv);
        }
      } else {
        this.errorElement.style.cursor = "pointer";
      }

      if (error instanceof AppError) {
        const a = document.createElement("a");
        a.innerText = "copy error info";
        a.style.textDecoration = "underline";

        a.onclick = (e) => {
          e.stopPropagation();
          copy(JSON.stringify(error.data, undefined, 2));
          a.innerText = "copied!";
          setTimeout(() => {
            a.innerText = "copy error info";
          }, 3000);
        };
        a.style.cursor = "pointer";
        a.title = "copy error info";
        this.errorElement.appendChild(a);
      }
    }

    if (!error && this.errorElement) {
      this.errorElement.remove();
      this.errorElement = null;
    }

    return this.errorElement;
  }
}
