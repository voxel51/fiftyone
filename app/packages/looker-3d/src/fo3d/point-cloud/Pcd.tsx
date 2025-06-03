import { getSampleSrc } from "@fiftyone/state";
import throttle from "lodash/throttle";
import { useEffect, useMemo, useRef } from "react";
import type { BufferAttribute, Quaternion, Vector3 } from "three";
import type { PcdAsset } from "../../hooks";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { DynamicPCDLoader } from "../../loaders/dynamic-pcd-loader";
import { useFo3dContext } from "../context";
import { getResolvedUrlForFo3dAsset } from "../utils";
import { usePcdMaterial } from "./use-pcd-material";
import { PCDAttributes } from "../../loaders/dynamic-pcd-loader/types";

export const Pcd = ({
  name,
  pcd: { pcdPath, preTransformedPcdPath, defaultMaterial, centerGeometry },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  const { fo3dRoot, pointCloudSettings, setHoverMetadata } = useFo3dContext();

  const pcdUrl = useMemo(
    () =>
      preTransformedPcdPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(pcdPath, fo3dRoot)),
    [pcdPath, preTransformedPcdPath, fo3dRoot]
  );

  const points_ = useFoLoader(DynamicPCDLoader, pcdUrl);

  // todo: hack until https://github.com/pmndrs/react-three-fiber/issues/245 is fixed
  const points = useMemo(() => points_.clone(false), [points_]);

  useEffect(() => {
    if (points && centerGeometry) {
      points.geometry.center();
    }
  }, [points, centerGeometry]);

  const pcdContainerRef = useRef();

  const pointsMaterialElement = usePcdMaterial(
    name,
    points.geometry,
    defaultMaterial,
    pcdContainerRef
  );

  const pointerMoveHandler = useMemo(
    () =>
      throttle((e) => {
        // e.index is the vertex/point index under the cursor
        const idx = e.index;
        if (idx === undefined) return;

        const {
          color,
          intensity,
          position: posAttr,
        } = points.geometry.attributes;

        const md: Record<string, any> = { index: idx };
        if (color) {
          md.rgb = [color.getX(idx), color.getY(idx), color.getZ(idx)];
        }
        if (posAttr) {
          md.coord = [posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)];
        }

        // dynamically handle all other attributes
        Object.keys(points.geometry.attributes).forEach((attr) => {
          if (attr === "color" || attr === "intensity" || attr === "position")
            return;
          md[attr] = points.geometry.attributes[attr].getX(idx);
        });

        setHoverMetadata(md);
      }, 30),
    [points, setHoverMetadata]
  );

  const hoverProps = useMemo(() => {
    if (!pointCloudSettings.enableTooltip) return {};

    return {
      // fires on *every* intersected point
      onPointerMove: pointerMoveHandler,
      onPointerOut: () => {
        setHoverMetadata(null);
      },
    };
  }, [pointCloudSettings.enableTooltip, pointerMoveHandler]);

  useEffect(() => {
    return () => {
      pointerMoveHandler.cancel();
    };
  }, [pointerMoveHandler]);

  if (!points) {
    return null;
  }

  return (
    <primitive
      ref={pcdContainerRef}
      object={points}
      position={position}
      quaternion={quaternion}
      scale={scale}
      {...hoverProps}
    >
      {pointsMaterialElement}
      {children ?? null}
    </primitive>
  );
};
