import { isDirect3dSamplePath, isNativeMediaType } from "@fiftyone/utilities";

type NativeLookerSupport = {
  mediaField: string;
  mediaFieldPath: string | null | undefined;
  mimeType: string | null;
  sampleMediaType: string | null | undefined;
  samplePath: string | null | undefined;
};

/**
 * Determines whether the selected media source can use a native looker.
 *
 * The sample media type describes ``filepath``. A present alternate media
 * field must instead prove its own native compatibility through its path.
 */
export const supportsNativeLooker = ({
  mediaField,
  mediaFieldPath,
  mimeType,
  sampleMediaType,
  samplePath,
}: NativeLookerSupport): boolean => {
  if (
    isDirect3dSamplePath(samplePath) ||
    isDirect3dSamplePath(mediaFieldPath)
  ) {
    return true;
  }

  const hasAlternateMediaPath =
    mediaField !== "filepath" && Boolean(mediaFieldPath);

  if (!hasAlternateMediaPath) {
    return isNativeMediaType(sampleMediaType);
  }

  return Boolean(
    mimeType?.startsWith("image/") || mimeType?.startsWith("video/"),
  );
};
