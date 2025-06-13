import {
  currentModalUniqueIdJotaiAtom,
  jotaiStore,
} from "@fiftyone/state/src/jotai";
import { Billboard, Plane, Text, useCursor } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { useFo3dContext } from "../fo3d/context";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import { cuboidLabelLineWidthAtom, showIndexAtom } from "../state";
import { OverlayLabel } from "./loader";
import type { OverlayProps } from "./shared";
extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

let cache: Record<
  string,
  {
    latestIndex: number;
    instanceIdToIndexId: Record<string, number>;
  }
> = {};
let lastModalUniqueId = "";

const getIndexIdFromInstanceIdForLabel = (
  instanceId: string,
  label: OverlayLabel
) => {
  const currentModalUniqueId = jotaiStore.get(currentModalUniqueIdJotaiAtom);

  if (currentModalUniqueId !== lastModalUniqueId) {
    lastModalUniqueId = currentModalUniqueId;
    cache = {};
  }

  const key = `${currentModalUniqueId}-${label.label.toLocaleLowerCase()}`;

  if (
    cache[key] &&
    cache[key].instanceIdToIndexId &&
    typeof cache[key].instanceIdToIndexId[instanceId] === "number"
  ) {
    return cache[key].instanceIdToIndexId[instanceId];
  } else if (cache[key] && cache[key].instanceIdToIndexId) {
    cache[key].instanceIdToIndexId[instanceId] = cache[key].latestIndex + 1;
    cache[key].latestIndex += 1;
    return cache[key].instanceIdToIndexId[instanceId];
  } else {
    cache[key] = {
      latestIndex: 1,
      instanceIdToIndexId: {
        [instanceId]: 1,
      },
    };
  }

  return cache[key].instanceIdToIndexId[instanceId];
};

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
}

export const Cuboid = ({
  itemRotation,
  dimensions,
  opacity,
  rotation,
  location,
  selected,
  onClick,
  tooltip,
  label,
  color,
  useLegacyCoordinates,
}: CuboidProps) => {
  const lineWidth = useRecoilValue(cuboidLabelLineWidthAtom);
  const geo = useMemo(
    () => dimensions && new THREE.BoxGeometry(...dimensions),
    [dimensions]
  );

  // @todo: add comment to add more context on what legacy coordinates means
  const loc = useMemo(() => {
    const [x, y, z] = location;
    return useLegacyCoordinates
      ? new THREE.Vector3(x, y - 0.5 * dimensions[1], z)
      : new THREE.Vector3(x, y, z);
  }, [location, dimensions, useLegacyCoordinates]);

  const itemRotationVec = useMemo(
    () => new THREE.Vector3(...itemRotation),
    [itemRotation]
  );
  const resolvedRotation = useMemo(
    () => new THREE.Vector3(...rotation),
    [rotation]
  );
  const actualRotation = useMemo(
    () => resolvedRotation.add(itemRotationVec).toArray(),
    [resolvedRotation, itemRotationVec]
  );

  const [isCuboidHovered, setIsCuboidHovered] = useState(false);
  useCursor(isCuboidHovered);

  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const geometry = useMemo(
    () =>
      new LineSegmentsGeometry().fromLineSegments(
        new THREE.LineSegments(edgesGeo)
      ),
    [edgesGeo]
  );

  const isSimilarLabelHovered = useSimilarLabels3d(label);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered: isCuboidHovered,
    isSimilarLabelHovered,
    defaultColor: color,
  });

  const material = useMemo(
    () =>
      new LineMaterial({
        opacity: opacity,
        transparent: false,
        color: strokeAndFillColor,
        linewidth: lineWidth,
      }),
    [
      selected,
      lineWidth,
      opacity,
      isCuboidHovered,
      isSimilarLabelHovered,
      strokeAndFillColor,
    ]
  );

  const { isSceneInitialized, upVector } = useFo3dContext();

  const showIndex = useRecoilValue(showIndexAtom);

  const labelBillboardPosition = useMemo(() => {
    // Compute the cuboid's extent along the up vector
    const upNorm = upVector.clone().normalize();
    const cuboidExtent =
      Math.abs(dimensions[0] * upNorm.x) +
      Math.abs(dimensions[1] * upNorm.y) +
      Math.abs(dimensions[2] * upNorm.z);
    const margin = 0.2 * Math.max(...dimensions); // 10% of the largest dimension
    // Offset from the cuboid center along the up vector
    return upNorm.multiplyScalar(cuboidExtent / 2 + margin);
  }, [upVector, dimensions]);

  let labelText = label.label;
  if (showIndex && typeof label.index === "number") {
    labelText += " " + Number(label.index).toLocaleString();
  } else if (showIndex && label.instance?._id && label.instance.index) {
    labelText +=
      " " + getIndexIdFromInstanceIdForLabel(label.instance._id, label);
  }

  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

  if (!location || !dimensions) return null;

  /**
   * note: it's important to not set event handlers on the group,
   * because raycasting for line2 is unstable.
   * so we skip the border and only use the volume instead, which is more stable.
   *
   * we're using line2 over core line because line2 allows configurable line width
   */

  return (
    <group>
      <mesh position={loc} rotation={actualRotation}>
        <lineSegments2 geometry={geometry} material={material} />
      </mesh>
      <mesh
        position={loc}
        rotation={actualRotation}
        onClick={onClick}
        onPointerOver={() => {
          setIsCuboidHovered(true);
          onPointerOver();
        }}
        onPointerOut={() => {
          setIsCuboidHovered(false);
          onPointerOut();
        }}
        {...restEventHandlers}
      >
        <Billboard position={labelBillboardPosition} follow={true}>
          {/* Faint white background plane behind the label */}
          <Plane
            args={[
              // width based on label length
              Math.max(2, labelText.length * 0.6),
              // height slightly larger than fontSize
              1.4,
            ]}
            // slightly behind the text
            position={[0, 0, -0.02]}
          >
            <meshBasicMaterial
              color={strokeAndFillColor}
              transparent
              opacity={isCuboidHovered || isSimilarLabelHovered ? 0.7 : 0.3}
            />
          </Plane>
          <Text fontSize={1} color="white">
            {labelText}
          </Text>
        </Billboard>
        <boxGeometry args={dimensions} />
        <meshBasicMaterial
          transparent={isSimilarLabelHovered ? false : true}
          opacity={isSimilarLabelHovered ? 0.95 : opacity * 0.5}
          color={strokeAndFillColor}
        />
      </mesh>
    </group>
  );
};
