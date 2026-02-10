import { ANNOTATION_CUBOID, ANNOTATION_POLYLINE } from "../../constants";
import type { FrustumData } from "../../frustum/types";
import type { PanelId } from "../../types";
import { ProjectedCuboidOverlay } from "./ProjectedCuboidOverlay";
import { ProjectedPointOverlay } from "./ProjectedPointOverlay";
import { ProjectedPolylineOverlay } from "./ProjectedPolylineOverlay";

interface Projected3dOverlaysProps {
  frustumData: FrustumData;
  annotationMode: string | null;
  panelId: PanelId;
}

/**
 * Renders all 3D-to-2D projection overlays for an image slice:
 * cuboid edges, polyline segments, and the raycasted cursor crosshair.
 */
export function Projected3dOverlays({
  frustumData,
  annotationMode,
  panelId,
}: Projected3dOverlaysProps) {
  return (
    <>
      {annotationMode === ANNOTATION_CUBOID && (
        <ProjectedCuboidOverlay frustumData={frustumData} />
      )}
      {annotationMode === ANNOTATION_POLYLINE && (
        <ProjectedPolylineOverlay frustumData={frustumData} />
      )}
      <ProjectedPointOverlay frustumData={frustumData} panelId={panelId} />
    </>
  );
}
