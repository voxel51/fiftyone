/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import {
  FiftyoneSceneRawJson,
  getFiftyoneSceneSummary,
} from "@fiftyone/looker-3d/src/utils";
import { getFetchFunction } from "@fiftyone/utilities";
import threeDIcon from "../icons/3d.svg";
import { DispatchEvent, ThreeDState } from "../state";
import { BaseElement, Events } from "./base";

const DEFAULT_FILL_STYLE = "rgba(255, 255, 255, 0.6)";
export class ThreeDElement extends BaseElement<ThreeDState, HTMLImageElement> {
  public imageSource: HTMLCanvasElement | HTMLImageElement;
  private isOpmAvailable: boolean;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private statusPainted = false;
  private isFetchingSummary = false;

  getEvents(): Events<ThreeDState> {
    return {
      load: ({ dispatchEvent }) => {
        this.canvas = document.createElement("canvas");
        this.canvas.style.imageRendering = "pixelated";
        this.canvas.width = this.isOpmAvailable
          ? this.element.naturalWidth
          : 512;
        this.canvas.height = this.isOpmAvailable
          ? this.element.naturalHeight
          : 512;

        this.ctx = this.canvas.getContext("2d");
        this.ctx.font = "32px";
        this.ctx.fillStyle = DEFAULT_FILL_STYLE;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.element, 0, 0);

        this.imageSource = this.canvas;

        // if no opm, draw 3D icon
        if (!this.isOpmAvailable) {
          this.drawIcon();
        }

        this.update({
          loaded: true,
          dimensions: [
            this.isOpmAvailable ? this.element.naturalWidth : 512,
            this.isOpmAvailable ? this.element.naturalHeight : 512,
          ],
        });
        dispatchEvent("render");
      },
      error: ({ update }) => {
        update({ error: true, dimensions: [512, 512], loaded: true });
      },
    };
  }

  createHTMLElement(
    dispatchEvent: DispatchEvent,
    { src, isOpmAvailable }: Readonly<ThreeDState["config"]>
  ) {
    this.isOpmAvailable = isOpmAvailable;

    this.element = new Image();
    this.element.loading = "eager";
    this.element.crossOrigin = "Anonymous";
    if (this.isOpmAvailable) {
      this.element.setAttribute("src", src);
    } else {
      // use 1x1 bas64 blank img
      this.element.setAttribute(
        "src",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNgYGD4DwABDQF/w6a5YwAAAABJRU5ErkJggg=="
      );
    }

    this.element.addEventListener("load", () => {
      dispatchEvent("load");
    });

    return this.element;
  }

  drawIcon() {
    const icon = new Image();
    icon.loading = "eager";
    icon.src = threeDIcon;
    icon.onload = () => {
      // draw a 3d icon
      this.ctx.globalAlpha = 0.3;
      this.ctx.drawImage(
        icon,
        this.canvas.width / 2 - 125,
        this.canvas.height / 2 - 250,
        250,
        310
      );

      // write ".fo3d" on top of the icon
      this.ctx.font = "30px serif";
      this.ctx.fillStyle = DEFAULT_FILL_STYLE;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(
        ".fo3d",
        this.canvas.width / 2,
        this.canvas.height / 2 - 120
      );

      // give the icon a dark orange tint
      this.ctx.globalCompositeOperation = "source-atop";
      this.ctx.fillStyle = "rgba(255, 165, 0, 0.5)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // reset
      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "alphabetic";
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = DEFAULT_FILL_STYLE;
    };
  }

  async getFo3dSummary(src: string) {
    this.isFetchingSummary = true;
    const scene = await getFetchFunction()("GET", src);
    this.isFetchingSummary = false;
    const summary = getFiftyoneSceneSummary(scene as FiftyoneSceneRawJson);
    const summaryText = Object.entries(summary)
      .map(([key, value]) => {
        switch (key) {
          case "meshCount":
            if (value === 0) {
              return "";
            }
            if (value === 1) {
              return `${value} mesh`;
            }
            return `${value} meshes`;
          case "pointcloudCount":
            if (value === 0) {
              return "";
            }
            if (value === 1) {
              return `${value} pointcloud`;
            }
            return `${value} pointclouds`;
          case "shapeCount":
            if (value === 0) {
              return "";
            }
            if (value === 1) {
              return `${value} shape`;
            }
            return `${value} shapes`;
          case "unknownCount":
            if (value === 0) {
              return "";
            }
            return `${value} unknown`;
          default:
            return "";
        }
      })
      .join("\n");
    return summaryText;
  }

  printSummary(summary: string) {
    const lines = summary.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineWidth = this.ctx.measureText(lines[i]).width;
      const x = this.canvas.width / 2 - lineWidth / 2;
      const y = this.canvas.height / 2 + 100 + i * 40;
      this.ctx.fillText(lines[i], x, y);
    }
    this.statusPainted = true;
  }

  renderSelf({ loaded, config: { src } }: Readonly<ThreeDState>) {
    if (
      !loaded ||
      this.isOpmAvailable ||
      this.statusPainted ||
      this.isFetchingSummary
    ) {
      return;
    }

    this.getFo3dSummary(src)
      .then((summary) => {
        this.printSummary(summary);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.isFetchingSummary = false;
      });

    return null;
  }
}
