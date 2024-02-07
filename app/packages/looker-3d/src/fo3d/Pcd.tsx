import { useLoader } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { OnChangeHandler } from "leva/dist/declarations/src/types";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  PANEL_ORDER_PCD_CONTROLS,
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../constants";
import { PcdAsset } from "../hooks";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../renderables/pcd/shaders";
import { currentPointSizeAtom, isPointSizeAttenuatedAtom } from "../state";

const usePcdControls = () => {
  const [pointSize, setPointSize] = useRecoilState(currentPointSizeAtom);
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] = useRecoilState(
    isPointSizeAttenuatedAtom
  );

  const pointSizeNum = useMemo(() => Number(pointSize), [pointSize]);

  const onChangeTextBox: OnChangeHandler = useCallback(
    (newValue: number, _props, options) => {
      if (options.initial) return;

      setPointSize(String(newValue));
    },
    []
  );

  useControls(
    () => ({
      PointClouds: folder(
        {
          pointSize: {
            value: pointSizeNum,
            min: 0.1,
            max: 100,
            step: 0.1,
            onChange: onChangeTextBox,
            label: "Points Size",
          },
          isPointSizeAttenuated: {
            value: isPointSizeAttenuated,
            onChange: setIsPointSizeAttenuated,
            label: "Attenuated",
          },
        },
        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: false,
        }
      ),
    }),
    [pointSizeNum, onChangeTextBox]
  );

  return {
    pointSize: pointSizeNum,
    isPointSizeAttenuated,
    shadeBy: "height",
  };
};

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
  const { pointSize, isPointSizeAttenuated, shadeBy } = usePcdControls();

  console.log("point size is ", pointSize);

  const pointsMaterial = useMemo(() => {
    const pointSizeNum = Number(pointSize);

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        return (
          <ShadeByHeight
            gradients={PCD_SHADING_GRADIENTS}
            // todo
            min={0}
            // todo
            max={1000}
            key={pointSizeNum}
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
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
            // color={customColor}
            color={"red"}
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
  }, [shadeBy, pointSize, isPointSizeAttenuated]);

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
