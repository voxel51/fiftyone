interface CameraAssociationSetting {
  readonly calibrationTopic: string | null;
}

/**
 * Applies explicit per-image calibration overrides to inventory-owned camera
 * associations for 3D frustum textures.
 */
export function resolveMcapFrustumImageTopics({
  cameraTopics,
  inventoryImageTopics,
  settingsByImageTopic,
}: {
  readonly cameraTopics: readonly string[];
  readonly inventoryImageTopics: readonly string[];
  readonly settingsByImageTopic: Readonly<
    Record<string, CameraAssociationSetting>
  >;
}): readonly string[] {
  const imageByCalibration = new Map<string, string>();

  // Explicit overrides take precedence. Sort for deterministic behavior when
  // malformed workspace state maps more than one image to one calibration.
  for (const [imageTopic, settings] of Object.entries(
    settingsByImageTopic,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (
      settings.calibrationTopic &&
      cameraTopics.includes(settings.calibrationTopic) &&
      !imageByCalibration.has(settings.calibrationTopic)
    ) {
      imageByCalibration.set(settings.calibrationTopic, imageTopic);
    }
  }

  // Fill remaining cameras from the scene-inventory association, but do not
  // leave an image on its old frustum after the user moved it elsewhere.
  cameraTopics.forEach((calibrationTopic, index) => {
    const imageTopic = inventoryImageTopics[index];
    if (!imageTopic || imageByCalibration.has(calibrationTopic)) {
      return;
    }
    const override = settingsByImageTopic[imageTopic]?.calibrationTopic;
    if (!override || override === calibrationTopic) {
      imageByCalibration.set(calibrationTopic, imageTopic);
    }
  });

  return cameraTopics.map(
    (calibrationTopic) => imageByCalibration.get(calibrationTopic) ?? "",
  );
}
