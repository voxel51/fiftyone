import {
  MEDIA_TYPE_IMAGE,
  MEDIA_TYPE_VIDEO,
  isNativeMediaType,
} from "@fiftyone/utilities";

type NativeLookerSupport = {
  hasAlternateMediaPath: boolean;
  isDirect3dSample: boolean;
  mimeType: string | null;
  sampleMediaType: string | null | undefined;
};

/**
 * Determines whether the selected media source can use a native looker.
 *
 * The sample media type describes ``filepath``. A present alternate media
 * field must instead prove its own native compatibility through its path.
 */
export const supportsNativeLooker = ({
  hasAlternateMediaPath,
  isDirect3dSample,
  mimeType,
  sampleMediaType,
}: NativeLookerSupport): boolean => {
  if (isDirect3dSample) {
    return true;
  }

  if (!hasAlternateMediaPath) {
    return isNativeMediaType(sampleMediaType);
  }

  if (mimeType === null) {
    return (
      sampleMediaType === MEDIA_TYPE_IMAGE ||
      sampleMediaType === MEDIA_TYPE_VIDEO
    );
  }

  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
};
