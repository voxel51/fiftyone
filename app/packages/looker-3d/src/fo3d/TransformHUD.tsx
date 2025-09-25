import { useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  isTransformingAtom,
  selectedLabelForTransformAtom,
  transformDataAtom,
  transformModeAtom,
} from "../state";

const TransformHUDContainer = styled.div`
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 500;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  border-radius: 4px;
  padding: 0.4em 0.8em;
  font-size: 0.8rem;
  pointer-events: none;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  white-space: nowrap;
  line-height: 1.2;
  opacity: 0.7;
`;

const TransformModeLabel = styled.span`
  color: #a0a0ff;
  font-weight: 600;
  text-transform: uppercase;
  margin-right: 0.5em;
`;

const ValueLabel = styled.span`
  color: #b3b3b3;
  margin-right: 0.2em;
`;

const ValueNumber = styled.span`
  color: #fff;
  font-weight: 500;
  margin-right: 0.5em;
`;

const formatNumber = (
  value: number | undefined,
  decimals: number = 3
): string => {
  if (value === undefined) return "0.000";
  return value.toFixed(decimals);
};

export const TransformHUD = () => {
  const isTransforming = useRecoilValue(isTransformingAtom);
  const transformMode = useRecoilValue(transformModeAtom);
  const selectedLabel = useRecoilValue(selectedLabelForTransformAtom);
  const transformData = useRecoilValue(transformDataAtom);

  if (!isTransforming || !selectedLabel) {
    return null;
  }

  const renderTransformValues = () => {
    switch (transformMode) {
      case "translate":
        return (
          <>
            <ValueLabel>dx:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.dx)}</ValueNumber>
            <ValueLabel>dy:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.dy)}</ValueNumber>
            <ValueLabel>dz:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.dz)}</ValueNumber>
          </>
        );

      case "scale":
        return (
          <>
            <ValueLabel>dimx:</ValueLabel>
            <ValueNumber>
              {formatNumber(transformData.dimensionX, 2)}
            </ValueNumber>
            <ValueLabel>dimy:</ValueLabel>
            <ValueNumber>
              {formatNumber(transformData.dimensionY, 2)}
            </ValueNumber>
            <ValueLabel>dimz:</ValueLabel>
            <ValueNumber>
              {formatNumber(transformData.dimensionZ, 2)}
            </ValueNumber>
          </>
        );

      case "rotate":
        return (
          <>
            <ValueLabel>rx:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.rotationX)}°</ValueNumber>
            <ValueLabel>ry:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.rotationY)}°</ValueNumber>
            <ValueLabel>rz:</ValueLabel>
            <ValueNumber>{formatNumber(transformData.rotationZ)}°</ValueNumber>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <TransformHUDContainer>
      <TransformModeLabel>{transformMode}</TransformModeLabel>
      {renderTransformValues()}
    </TransformHUDContainer>
  );
};
