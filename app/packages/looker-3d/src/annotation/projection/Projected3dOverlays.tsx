import type { FrustumData } from "../../frustum/types";
import type { PanelId } from "../../types";
import { AllProjectedAnnotations } from "./AllProjectedAnnotations";
import { ProjectedPointOverlay } from "./ProjectedPointOverlay";

interface Projected3dOverlaysProps {
  frustumData: FrustumData;
  annotationMode: string | null;
  panelId: PanelId;
}

/**
 * Renders all 3D-to-2D projection overlays for an image slice:
 */
export function Projected3dOverlays({
  frustumData,
  annotationMode,
  panelId,
}: Projected3dOverlaysProps) {
  return (
    <>
      <AllProjectedAnnotations frustumData={frustumData} />

      <ProjectedPointOverlay frustumData={frustumData} panelId={panelId} />
    </>
  );
}
