/* eslint-disable react/no-unknown-property */
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";

import type { GridVisualization } from "../../../decoders";
import {
  pointCloudObjectTransform,
  scenePoseObjectTransform,
} from "./transforms";
import type { GridPanelLayer } from "./types";
import { useInvalidateOn } from "./use-invalidate-on";
import { isFinitePositiveNumber } from "./utils";

// Memoized: unrelated ticks and hovers skip re-rendering map layers whose
// frame and transform kept identity.
export const GridSceneLayer = memo(function GridSceneLayer({
  layer,
  renderOrder,
}: {
  readonly layer: GridPanelLayer;
  readonly renderOrder: number;
}) {
  const { frame, frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );
  const poseTransform = useMemo(
    () => scenePoseObjectTransform(frame.pose),
    [frame.pose],
  );
  // The texture is keyed on message identity (layer id + content time), not
  // on the frame object: playback re-delivers the same grid message in new
  // wrapper objects every batch, and re-uploading a multi-megabyte map
  // texture per batch would stall the scene. `frame` is therefore
  // deliberately omitted from the deps (the lint disable below); it only
  // participates as the fallback key when a layer carries no content time.
  const texture = useMemo(
    () => createGridTexture(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer.id, layer.contentTimeNs ?? frame],
  );

  useEffect(() => () => texture.dispose(), [texture]);
  useInvalidateOn([objectTransform, poseTransform, renderOrder, texture]);

  const width = frame.columnCount * frame.cellSize[0];
  const height = frame.rowCount * frame.cellSize[1];
  if (!isFinitePositiveNumber(width) || !isFinitePositiveNumber(height)) {
    return null;
  }

  // Cast, not a type: @react-three/fiber's bundled three types disagree with
  // the app's pinned three version (its `Texture` requires `isTextureArray`,
  // which our DataTexture predates), so a structurally-valid texture fails
  // the material prop check. Runtime is unaffected; drop this cast when the
  // two three versions are aligned. Same workaround as SceneTextSprite.
  const textureMap = texture as never;

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <group
        position={poseTransform.position}
        quaternion={poseTransform.quaternion}
      >
        {/* The grid pose anchors the plane's origin corner (+x columns,
            +y rows); PlaneGeometry is centered, hence the half-size offset.
            depthWrite stays off so coplanar map layers composite by
            renderOrder instead of z-fighting. */}
        <mesh position={[width / 2, height / 2, 0]} renderOrder={renderOrder}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            depthWrite={false}
            map={textureMap}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
});

function createGridTexture(frame: GridVisualization): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    frame.rgba,
    frame.columnCount,
    frame.rowCount,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}
