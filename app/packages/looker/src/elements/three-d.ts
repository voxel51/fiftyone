/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  FiftyoneSceneRawJson,
  getFiftyoneSceneSummary,
} from "@fiftyone/looker-3d/src/utils";
import { getFetchFunction } from "@fiftyone/utilities";
import { DispatchEvent, ThreeDState } from "../state";
import { BaseElement, Events } from "./base";

const DEFAULT_FILL_STYLE = "rgba(255, 255, 255, 0.6)";
export class ThreeDElement extends BaseElement<ThreeDState, HTMLImageElement> {
  public imageSource: HTMLCanvasElement | HTMLImageElement;
  private isOpmAvailable: boolean;
  private isFo3d: boolean;

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
          this.drawExtension();
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
    { src, isOpmAvailable, isFo3d }: Readonly<ThreeDState["config"]>
  ) {
    this.isOpmAvailable = isOpmAvailable;
    this.isFo3d = isFo3d;

    this.element = new Image();
    this.element.loading = "eager";
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

  drawExtension() {
    // background color: slightly faded dark-ink-black
    this.ctx.fillStyle = "rgba(17, 25, 40, 0.95)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();
  }

  private drawGrid() {
    this.ctx.save();
    this.ctx.globalAlpha = 0.13;
    this.ctx.strokeStyle = "#60A5FA";
    this.ctx.lineWidth = 1;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const gridSize = 40;

    // vertical grid lines
    for (let x = 0; x <= width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    // horizontal grid lines
    for (let y = 0; y <= height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // axes lines (X and Y only)
    this.ctx.globalAlpha = 0.18;
    this.ctx.lineWidth = 1.2;

    // X axis (red, horizontal)
    this.ctx.strokeStyle = "#FF5555";
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(width, centerY);
    this.ctx.stroke();

    // Y axis (green, vertical)
    this.ctx.strokeStyle = "#22DD55";
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, 0);
    this.ctx.lineTo(centerX, height);
    this.ctx.stroke();

    // a small elevated '3D' logo at the top right
    const logoText = this.isFo3d ? "3D" : "PCD";
    const logoFont = "bold 18px system-ui, sans-serif";
    const paddingX = 14;
    const margin = 10;
    this.ctx.font = logoFont;
    const textWidth = this.ctx.measureText(logoText).width;
    // extra space for cube
    const rectWidth = textWidth + paddingX * 2 + 32;
    const rectHeight = 28;
    const radius = 10;
    // position at top right
    const rectX = this.canvas.width - rectWidth - margin;
    const rectY = margin;
    // draw background rounded rectangle
    this.ctx.save();
    this.ctx.globalAlpha = 0.55;
    this.ctx.fillStyle = "#151A23";
    this.ctx.beginPath();
    this.ctx.moveTo(rectX + radius, rectY);
    this.ctx.lineTo(rectX + rectWidth - radius, rectY);
    this.ctx.quadraticCurveTo(
      rectX + rectWidth,
      rectY,
      rectX + rectWidth,
      rectY + radius
    );
    this.ctx.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
    this.ctx.quadraticCurveTo(
      rectX + rectWidth,
      rectY + rectHeight,
      rectX + rectWidth - radius,
      rectY + rectHeight
    );
    this.ctx.lineTo(rectX + radius, rectY + rectHeight);
    this.ctx.quadraticCurveTo(
      rectX,
      rectY + rectHeight,
      rectX,
      rectY + rectHeight - radius
    );
    this.ctx.lineTo(rectX, rectY + radius);
    this.ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    // draw cube
    const cubeSize = 18;
    const cubeX = rectX + paddingX;
    const cubeY = rectY + rectHeight / 2;

    const half = cubeSize / 2;
    const quarter = cubeSize / 4;

    // top face
    this.ctx.save();
    this.ctx.globalAlpha = 0.85;
    this.ctx.beginPath();
    this.ctx.moveTo(cubeX, cubeY - half); // top
    this.ctx.lineTo(cubeX + half, cubeY - quarter); // right
    this.ctx.lineTo(cubeX, cubeY); // bottom
    this.ctx.lineTo(cubeX - half, cubeY - quarter); // left
    this.ctx.closePath();
    // one of primary voxel51 colors
    this.ctx.fillStyle = "#FF6D04";
    this.ctx.fill();

    // left face
    this.ctx.beginPath();
    this.ctx.moveTo(cubeX - half, cubeY - quarter);
    this.ctx.lineTo(cubeX, cubeY);
    this.ctx.lineTo(cubeX, cubeY + half);
    this.ctx.lineTo(cubeX - half, cubeY + quarter);
    this.ctx.closePath();
    // one of secondary voxel51 colors
    this.ctx.fillStyle = "#B681FF";
    this.ctx.fill();

    // right face
    this.ctx.beginPath();
    this.ctx.moveTo(cubeX + half, cubeY - quarter);
    this.ctx.lineTo(cubeX, cubeY);
    this.ctx.lineTo(cubeX, cubeY + half);
    this.ctx.lineTo(cubeX + half, cubeY + quarter);
    this.ctx.closePath();
    this.ctx.fillStyle = "#ff0000";
    this.ctx.fill();

    // outline
    this.ctx.globalAlpha = 0.7;
    this.ctx.strokeStyle = "#fff";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cubeX, cubeY - half);
    this.ctx.lineTo(cubeX + half, cubeY - quarter);
    this.ctx.lineTo(cubeX + half, cubeY + quarter);
    this.ctx.lineTo(cubeX, cubeY + half);
    this.ctx.lineTo(cubeX - half, cubeY + quarter);
    this.ctx.lineTo(cubeX - half, cubeY - quarter);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.font = logoFont;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.shadowColor = "rgba(0,0,0,0.45)";
    this.ctx.shadowBlur = 6;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillStyle = "#fff";
    this.ctx.globalAlpha = 0.95;
    this.ctx.fillText(logoText, cubeX + half + 8, rectY + rectHeight / 2);
    this.ctx.restore();

    this.ctx.restore();
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
    this.ctx.save();

    const lines = summary.split("\n").filter((line) => line.trim() !== "");

    if (lines.length === 0) {
      this.ctx.restore();
      this.statusPainted = true;
      return;
    }

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 1.3;

    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font =
      '500 28px system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.globalAlpha = 0.6;

    // adjusted line height for 28px font (28px * 1.5)
    const lineHeight = 42;

    for (let i = 0; i < lines.length; i++) {
      const y = centerY + (i - (lines.length - 1) / 2) * lineHeight;
      this.ctx.fillText(lines[i], centerX, y);
    }

    this.ctx.restore();
    this.statusPainted = true;
  }

  renderSelf({ loaded, config: { src, isFo3d } }: Readonly<ThreeDState>) {
    if (
      !loaded ||
      this.isOpmAvailable ||
      this.statusPainted ||
      this.isFetchingSummary
    ) {
      return;
    }

    if (isFo3d) {
      this.getFo3dSummary(src)
        .then((summary) => {
          this.printSummary(summary);
          this.update({ loaded: true });
        })
        .catch((e) => {
          console.error(e);
        })
        .finally(() => {
          this.isFetchingSummary = false;
        });
    }

    return null;
  }
}
