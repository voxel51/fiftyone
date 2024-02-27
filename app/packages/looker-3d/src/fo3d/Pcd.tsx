import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../constants";
import { PcdAsset } from "../hooks";
import { usePcdControls } from "../hooks/use-pcd-controls";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../renderables/pcd/shaders";
import { activeNodeAtom } from "../state";

export const Pcd = ({
  name,
  pcd,
  position,
  quaternion,
  scale,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const points = useLoader(PCDLoader, pcd.pcdUrl);
  const currentActiveNode = useRecoilValue(activeNodeAtom);

  const isThisNodeSelected = currentActiveNode?.name === name;

  const { customColorMap, pointSize, isPointSizeAttenuated, shadeBy } =
    usePcdControls(name, pcd.defaultMaterial, isThisNodeSelected);

  const pointsMaterial = useMemo(() => {
    const pointSizeNum = Number(pointSize);

    // to trigger rerender
    const key = `${name}-${pointSizeNum}-${isPointSizeAttenuated}-${shadeBy}-${customColorMap[name]}`;

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        return (
          <ShadeByHeight
            gradients={PCD_SHADING_GRADIENTS}
            // todo
            min={0}
            // todo
            max={1000}
            key={key}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_INTENSITY:
        return (
          <ShadeByIntensity
            // {...colorMinMax}
            gradients={PCD_SHADING_GRADIENTS}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_CUSTOM:
        return (
          <CustomColorShader
            key={key}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
            color={customColorMap[name] || "#ffffff"}
          />
        );
      default:
        return (
          <pointsMaterial
            color={"white"}
            // color={defaultShadingColor}
            // 1000 and 2 are arbitrary values that seem to work well
            size={
              isPointSizeAttenuated ? pointSizeNum / 1000 : pointSizeNum / 2
            }
            sizeAttenuation={isPointSizeAttenuated}
          />
        );
    }
  }, [shadeBy, pointSize, isPointSizeAttenuated, customColorMap]);

  if (!points) {
    return null;
  }

  return (
    <>
      <primitive
        object={points}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        {pointsMaterial}
      </primitive>
    </>
  );
};
