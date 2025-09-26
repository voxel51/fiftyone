import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  hoveredLabelAtom,
  hoveredPolylineInfoAtom,
  isTransformingAtom,
  selectedLabelForAnnotationAtom,
  transformDataAtom,
  transformModeAtom,
  transformedLabelsAtom,
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
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const transformData = useRecoilValue(transformDataAtom);
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const hoveredPolylineInfo = useRecoilValue(hoveredPolylineInfoAtom);
  const transformedLabels = useRecoilValue(transformedLabelsAtom);
  const mode = useAtomValue(fos.modalMode);

  // Calculate centroid for polylines
  // todo: needs to use transformed points, if any
  const centroid = useMemo(() => {
    if (hoveredLabel?._cls === "Polyline" && hoveredLabel?.points3d) {
      const allPoints = hoveredLabel.points3d.flat();
      if (allPoints.length === 0) return [0, 0, 0];

      const sum = allPoints.reduce(
        (acc, point) => [
          acc[0] + point[0],
          acc[1] + point[1],
          acc[2] + point[2],
        ],
        [0, 0, 0]
      );

      return [
        sum[0] / allPoints.length,
        sum[1] / allPoints.length,
        sum[2] / allPoints.length,
      ] as [number, number, number];
    }
    return [0, 0, 0];
  }, [hoveredLabel]);

  const renderTransformMode = () => {
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
              <ValueNumber>
                {formatNumber(transformData.rotationX)}°
              </ValueNumber>
              <ValueLabel>ry:</ValueLabel>
              <ValueNumber>
                {formatNumber(transformData.rotationY)}°
              </ValueNumber>
              <ValueLabel>rz:</ValueLabel>
              <ValueNumber>
                {formatNumber(transformData.rotationZ)}°
              </ValueNumber>
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
        <br />
        <ValueLabel>pos:</ValueLabel>
        <ValueNumber>
          {formatNumber(transformData.x)}, {formatNumber(transformData.y)},{" "}
          {formatNumber(transformData.z)}
        </ValueNumber>
      </TransformHUDContainer>
    );
  };

  const renderHoverMode = () => {
    // Get transform data for the hovered label if it exists
    const labelId = hoveredLabel?._id;
    const transformedData = labelId ? transformedLabels[labelId] : null;

    const getWorldPosition = () => {
      // For polylines, we don't show position - we show individual points instead
      if (hoveredLabel._cls === "Polyline") {
        return null;
      }

      // Use transformed data if available, otherwise fall back to original label data
      if (transformedData?.worldPosition) {
        return transformedData.worldPosition;
      }

      if (hoveredLabel._cls === "Detection" && hoveredLabel.location) {
        return hoveredLabel.location;
      }
      return [0, 0, 0];
    };

    const getWorldRotation = () => {
      // Use transformed data if available, otherwise fall back to original label data
      if (transformedData?.localRotation) {
        return transformedData.localRotation;
      }

      if (hoveredLabel._cls === "Detection" && hoveredLabel.rotation) {
        return hoveredLabel.rotation;
      } else if (hoveredLabel._cls === "Polyline" && hoveredLabel.rotation) {
        return hoveredLabel.rotation;
      }
      return [0, 0, 0];
    };

    const getDimensions = () => {
      // For polylines, we don't show dimensions - we show individual points instead
      if (hoveredLabel._cls === "Polyline") {
        return null;
      }

      // Use transformed data if available, otherwise fall back to original label data
      if (transformedData?.dimensions) {
        return transformedData.dimensions;
      }

      if (hoveredLabel._cls === "Detection" && hoveredLabel.dimensions) {
        return hoveredLabel.dimensions;
      }
      return [0, 0, 0];
    };

    const getPolylineLines = () => {
      if (hoveredLabel._cls === "Polyline" && hoveredLabel.points3d) {
        // Only show content if we have specific hover info
        if (
          hoveredPolylineInfo &&
          hoveredPolylineInfo.labelId === hoveredLabel._id
        ) {
          // Special case for centroid marker (segmentIndex = -1, pointIndex = -1)
          if (
            hoveredPolylineInfo.segmentIndex === -1 &&
            hoveredPolylineInfo.pointIndex === -1
          ) {
            // For centroid, we don't show any specific points, just return empty
            return [];
          }

          const segment =
            hoveredLabel.points3d[hoveredPolylineInfo.segmentIndex];
          if (segment) {
            // If hovering over a specific point, show only that point
            if (
              hoveredPolylineInfo.pointIndex !== undefined &&
              hoveredPolylineInfo.pointIndex >= 0
            ) {
              const point = segment[hoveredPolylineInfo.pointIndex];
              return point ? [[point]] : [];
            }
            // If hovering over a segment, show all points in that segment
            return [segment];
          }
        }

        return [];
      }
      return [];
    };

    const worldPos = getWorldPosition();
    const worldRot = getWorldRotation();
    const dimensions = getDimensions();
    const polylineLines = getPolylineLines();

    // Special handling for polylines
    if (hoveredLabel._cls === "Polyline") {
      const isHoveringCentroid =
        hoveredPolylineInfo &&
        hoveredPolylineInfo.segmentIndex === -1 &&
        hoveredPolylineInfo.pointIndex === -1;
      const isHoveringSpecificPoint =
        hoveredPolylineInfo &&
        hoveredPolylineInfo.pointIndex !== undefined &&
        hoveredPolylineInfo.pointIndex >= 0;
      const isHoveringSegment =
        hoveredPolylineInfo && hoveredPolylineInfo.pointIndex === undefined;

      // Only show HUD if we have specific hover info
      if (!hoveredPolylineInfo) {
        return null;
      }

      return (
        <TransformHUDContainer>
          {isHoveringCentroid ? (
            <>
              <ValueLabel>centroid:</ValueLabel>
              <br />
              <ValueNumber>
                {formatNumber(centroid[0])}, {formatNumber(centroid[1])},{" "}
                {formatNumber(centroid[2])}
              </ValueNumber>
              <br />
              <ValueLabel>rot:</ValueLabel>
              <ValueNumber>
                {formatNumber(worldRot[0])}°, {formatNumber(worldRot[1])}°,{" "}
                {formatNumber(worldRot[2])}°
              </ValueNumber>
            </>
          ) : isHoveringSpecificPoint ? (
            <>
              <ValueLabel>point:</ValueLabel>
              <br />
              {polylineLines.map((line, lineIndex) => (
                <div key={lineIndex}>
                  {line.map((point, pointIndex) => (
                    <div key={pointIndex} style={{ marginLeft: "1em" }}>
                      <ValueNumber>
                        {formatNumber(point[0])}, {formatNumber(point[1])},{" "}
                        {formatNumber(point[2])}
                      </ValueNumber>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : isHoveringSegment ? (
            <>
              <ValueLabel>segment:</ValueLabel>
              <br />
              {polylineLines.map((line, lineIndex) => (
                <div key={lineIndex}>
                  <ValueLabel>
                    S{hoveredPolylineInfo.segmentIndex + 1}:
                  </ValueLabel>
                  <br />
                  {line.map((point, pointIndex) => (
                    <div key={pointIndex} style={{ marginLeft: "1em" }}>
                      <ValueNumber>
                        {formatNumber(point[0])}, {formatNumber(point[1])},{" "}
                        {formatNumber(point[2])}
                      </ValueNumber>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}
        </TransformHUDContainer>
      );
    }

    // Standard display for Detection labels
    return (
      <TransformHUDContainer>
        <ValueLabel>pos:</ValueLabel>
        <ValueNumber>
          {formatNumber(worldPos[0])}, {formatNumber(worldPos[1])},{" "}
          {formatNumber(worldPos[2])}
        </ValueNumber>
        <br />
        <ValueLabel>rot:</ValueLabel>
        <ValueNumber>
          {formatNumber(worldRot[0])}°, {formatNumber(worldRot[1])}°,{" "}
          {formatNumber(worldRot[2])}°
        </ValueNumber>
        <br />
        <ValueLabel>dim:</ValueLabel>
        <ValueNumber>
          {formatNumber(dimensions[0], 2)}, {formatNumber(dimensions[1], 2)},{" "}
          {formatNumber(dimensions[2], 2)}
        </ValueNumber>
      </TransformHUDContainer>
    );
  };

  // Mode 1: Actively transforming
  if (isTransforming && selectedLabel) {
    return renderTransformMode();
  }

  // Mode 2: Hovering in annotate mode
  if (mode === "annotate" && hoveredLabel) {
    return renderHoverMode();
  }

  return null;
};
