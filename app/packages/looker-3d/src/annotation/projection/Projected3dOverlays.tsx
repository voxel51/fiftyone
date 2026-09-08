import type { Vector3 } from "three";
import type { FrustumData } from "../../frustum/types";
import type { PanelId } from "../../types";
import { AllProjectedAnnotations } from "./AllProjectedAnnotations";
import { ProjectedPointOverlay } from "./ProjectedPointOverlay";

interface Projected3dOverlaysProps {
  frustumData: FrustumData;
  panelId: PanelId;
  upVector?: Vector3 | null;
}

/**
 * Renders all 3D-to-2D projection overlays for an image slice:
 */
export function Projected3dOverlays({
  frustumData,
  panelId,
  upVector,
}: Projected3dOverlaysProps) {
  return (
    <>
      <AllProjectedAnnotations frustumData={frustumData} upVector={upVector} />

      <ProjectedPointOverlay frustumData={frustumData} panelId={panelId} />
    </>
  );
}
