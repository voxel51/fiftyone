import React, { useCallback } from "react";
import * as THREE from "three";
import type { Gradients } from "./types";

const useGradientMap = (gradients: Gradients, flipY: boolean = false) => {
  const generateTexture = useCallback((gradients: Gradients, flip: boolean) => {
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
    texture.flipY = flip;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);

  return React.useMemo(
    () => generateTexture(gradients, flipY),
    [gradients, generateTexture]
  );
};

export default useGradientMap;
