interface CameraAssociationSetting {
  readonly calibrationStream: string | null;
}

/**
 * Applies explicit per-image calibration overrides to inventory-owned camera
 * associations for 3D frustum textures.
 */
export function resolveFrustumImageStreams({
  cameraStreams,
  inventoryImageStreams,
  settingsByImageStream,
}: {
  readonly cameraStreams: readonly string[];
  readonly inventoryImageStreams: readonly string[];
  readonly settingsByImageStream: Readonly<
    Record<string, CameraAssociationSetting>
  >;
}): readonly string[] {
  const imageByCalibration = new Map<string, string>();

  // Explicit overrides take precedence. Sort for deterministic behavior when
  // malformed workspace state maps more than one image to one calibration.
  for (const [imageStream, settings] of Object.entries(
    settingsByImageStream,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (
      settings.calibrationStream &&
      cameraStreams.includes(settings.calibrationStream) &&
      !imageByCalibration.has(settings.calibrationStream)
    ) {
      imageByCalibration.set(settings.calibrationStream, imageStream);
    }
  }

  // Fill remaining cameras from the scene-inventory association, but do not
  // leave an image on its old frustum after the user moved it elsewhere.
  cameraStreams.forEach((calibrationStream, index) => {
    const imageStream = inventoryImageStreams[index];
    if (!imageStream || imageByCalibration.has(calibrationStream)) {
      return;
    }
    const override = settingsByImageStream[imageStream]?.calibrationStream;
    if (!override || override === calibrationStream) {
      imageByCalibration.set(calibrationStream, imageStream);
    }
  });

  return cameraStreams.map(
    (calibrationStream) => imageByCalibration.get(calibrationStream) ?? "",
  );
}
