import { useEffect, useMemo } from "react";
import * as THREE from "three";

const NUM_STOPS_FOR_PREDEFINED_NAME = 128;

import { ColorscaleInput } from "@fiftyone/looker/src/state";
import colormap from "colormap";
import { DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE } from "../../../constants";

// this is a map for color schemes not supported by colormap library
const EXPLICIT_COLOR_MAP: Record<string, Readonly<ColorscaleInput["list"]>> = {
  grayscale: [
    { value: 0.0, color: "#000000" },
    { value: 0.1111, color: "#1c1c1c" },
    { value: 0.2222, color: "#383838" },
    { value: 0.3333, color: "#555555" },
    { value: 0.4444, color: "#717171" },
    { value: 0.5556, color: "#8e8e8e" },
    { value: 0.6667, color: "#aaaaaa" },
    { value: 0.7778, color: "#c7c7c7" },
    { value: 0.8889, color: "#e3e3e3" },
    { value: 1.0, color: "#ffffff" },
  ],
  // based on https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/
  turbo: [
    { value: 0.0, color: "#30123b" },
    { value: 0.1111, color: "#4661d6" },
    { value: 0.2222, color: "#37a8fa" },
    { value: 0.3333, color: "#1ae4b6" },
    { value: 0.4444, color: "#71fe5f" },
    { value: 0.5556, color: "#c8ef34" },
    { value: 0.6667, color: "#faba39" },
    { value: 0.7778, color: "#f56918" },
    { value: 0.8889, color: "#ca2a04" },
    { value: 1.0, color: "#7a0403" },
  ],
  // based on Rasmusgo's https://www.shadertoy.com/view/lfByRh
  cyantoyellow: [
    { value: 0.0, color: "#00ffff" },
    { value: 0.1111, color: "#008fff" },
    { value: 0.2222, color: "#001fff" },
    { value: 0.3333, color: "#3838e2" },
    { value: 0.4444, color: "#8383bd" },
    { value: 0.5556, color: "#aca892" },
    { value: 0.6667, color: "#b1a764" },
    { value: 0.7778, color: "#beb13a" },
    { value: 0.8889, color: "#ded81d" },
    { value: 1.0, color: "#ffff00" },
  ],
};

export const getGradientFromSchemeName = (
  schemeName: string,
  numStops: number = NUM_STOPS_FOR_PREDEFINED_NAME
): Readonly<ColorscaleInput["list"]> => {
  let colors: string[] = [];

  try {
    colors = colormap({
      colormap: schemeName,
      nshades: numStops,
      format: "hex",
      alpha: 1,
    });
  } catch (e) {
    if (schemeName.toLocaleLowerCase() in EXPLICIT_COLOR_MAP) {
      return EXPLICIT_COLOR_MAP[schemeName.toLocaleLowerCase()];
    } else {
      console.error(
        `Error getting gradient from scheme name ${schemeName} with ${numStops} stops`
      );
      return DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE;
    }
  }

  return colors.map((color, index) => ({
    value: index / (numStops - 1),
    color,
  }));
};

const useGradientMap = (
  colorMap: Readonly<ColorscaleInput["list"]>,
  flipY: boolean = false
) => {
  const texture = useMemo(() => {
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

  useEffect(() => {
    return () => {
      if (texture) {
        texture.dispose?.();
      }
    };
  }, [texture]);

  return texture;
};

export default useGradientMap;
