import { useMemo } from "react";
import * as THREE from "three";

const NUM_STOPS_FOR_PREDEFINED_NAME = 128;

import { ColorscaleInput } from "@fiftyone/looker/src/state";
import colormap from "colormap";

export const getGradientFromSchemeName = (
  schemeName: string,
  numStops: number = NUM_STOPS_FOR_PREDEFINED_NAME
): ColorscaleInput["list"] => {
  const colors = colormap({
    colormap: schemeName,
    nshades: numStops,
    format: "hex",
    alpha: 1,
  });

  return colors.map((color, index) => ({
    value: index / (numStops - 1),
    color,
  }));
};

const useGradientMap = (
  colorMap: ColorscaleInput["list"],
  flipY: boolean = false
) => {
  return useMemo(() => {
    const gradients = colorMap.map((item) => [item.value, item.color] as const);

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    for (const [stop, col] of gradients) {
      grad.addColorStop(stop, col);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = flipY;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, [colorMap, flipY]);
};

export default useGradientMap;
