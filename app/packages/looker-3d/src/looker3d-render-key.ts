/**
 * Returns the React key for the 3D viewer subtree.
 *
 * Grouped direct-3D selections render through a synthetic FO3D scene, so
 * swapping the representative sample should not remount the viewer. Real FO3D
 * slice changes still get a distinct key so scene-local state resets when the
 * source scene changes.
 */
export const getLooker3dRenderKey = ({
  modalSampleId,
  activeFo3dSlice,
}: {
  modalSampleId: string;
  activeFo3dSlice: string | null;
}) => {
  return activeFo3dSlice
    ? `${modalSampleId}:${activeFo3dSlice}`
    : modalSampleId;
};
