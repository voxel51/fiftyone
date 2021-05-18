/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { MASK_ALPHA } from "./constants";

export class ColorGenerator {
  static white = "#ffffff";

  private static colorS: string = "70%";
  private static colorL: string = "40%";
  private static colorA: string = "0.875";

  private colors = {};
  private colorSet: string[];
  private seed: number;

  rawColors: { [key: number]: number } = {};
  rawMaskColors: Uint32Array;
  rawMaskColorsSelected: Uint32Array;

  constructor(seed: number = null) {
    this.seed = (seed % 32) / 32;

    const maskOffset = Math.floor(this.seed * 256);
    this.rawMaskColors = new Uint32Array(256);
    this.rawMaskColorsSelected = new Uint32Array(256);
    for (let i = 0; i < this.rawMaskColors.length; i++) {
      this.rawMaskColors[i] = this.rawColor((i + maskOffset) % 256);
      this.rawMaskColorsSelected[i] = this.rawMaskColors[i];
    }
    // reduce alpha of masks
    const rawMaskColorComponents = new Uint8Array(this.rawMaskColors.buffer);
    for (let i = 3; i < rawMaskColorComponents.length; i += 4) {
      rawMaskColorComponents[i] = Math.floor(255 * MASK_ALPHA);
    }
  }

  private generateColorSet(n: number = 36) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    const delta = 360 / n;
    this.colorSet = new Array(n);
    for (let i = 0; i < n; i++) {
      this.colorSet[i] = `hsla(${i * delta}, ${ColorGenerator.colorS}, ${
        ColorGenerator.colorL
      }, ${ColorGenerator.colorA})`;
      context.fillStyle = this.colorSet[i];
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      this.rawColors[i] = new Uint32Array(
        context.getImageData(0, 0, 1, 1).data.buffer
      )[0];
    }
  }

  color(index: number): string {
    if (!(index in this.colors)) {
      if (typeof this.colorSet === "undefined") {
        this.generateColorSet();
      }
      const rawIndex = Math.floor(this.seed * this.colorSet.length);
      this.colors[index] = this.colorSet[rawIndex];
      this.rawColors[index] = this.rawColors[rawIndex];
    }
    return this.colors[index];
  }

  rawColor(index: number): number {
    if (!(index in this.rawColors)) {
      this.color(index);
    }
    return this.rawColors[index];
  }
}

// Instantiate one colorGenerator for global use
export const colorGenerator = new ColorGenerator();
