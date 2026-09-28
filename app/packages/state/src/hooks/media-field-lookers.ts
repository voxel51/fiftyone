import {
  MEDIA_TYPE_IMAGE,
  MEDIA_TYPE_VIDEO,
  getMimeType,
  isDirect3dSamplePath,
  isNativeMediaType,
  type MediaReferenceDescriptor,
} from "@fiftyone/utilities";

export type NativeLookerType = "image" | "video" | "3d";

type MediaFieldLookerSample = {
  filepath?: string | null;
  media_reference?: MediaReferenceDescriptor | null;
  metadata?: { mime_type?: string } | null;
  media_type?: string | null;
  _media_type?: string | null;
};

type ResolveMediaFieldLookerParams = {
  mediaField: string;
  sample: MediaFieldLookerSample;
  urls: Record<string, string>;
};

type NativeLookerSupport = {
  hasAlternateMediaPath: boolean;
  isDirect3dSample: boolean;
  mimeType: string | null;
  sampleMediaType: string | null | undefined;
};

/**
 * Resolves the selected media source and the built-in looker that can render it.
 *
 * The root sample media type and metadata describe ``filepath`` only. Alternate
 * fields are classified from their own paths so they can safely override it.
 */
export const resolveMediaFieldLooker = ({
  mediaField,
  sample,
  urls,
}: ResolveMediaFieldLookerParams) => {
  const mediaFieldPath = urls[mediaField];
  const hasMediaReference = Boolean(sample.media_reference);
  const hasSelectedMediaPath = Boolean(mediaFieldPath?.trim());
  const hasAlternateMediaPath =
    mediaField !== "filepath" && hasSelectedMediaPath;
  const selectedMediaPath = hasMediaReference
    ? null
    : hasAlternateMediaPath
      ? mediaFieldPath
      : (urls.filepath ?? sample.filepath);
  const mimeType = getMimeType(
    sample,
    hasAlternateMediaPath ? mediaFieldPath : undefined,
  );
  const isDirect3dSample =
    isDirect3dSamplePath(selectedMediaPath) ||
    (!hasAlternateMediaPath && isDirect3dSamplePath(sample.filepath));
  const sampleMediaType = sample.media_type ?? sample._media_type;
  const nativeLookerType = hasMediaReference
    ? null
    : getNativeLookerType({
        hasAlternateMediaPath,
        isDirect3dSample,
        mimeType,
        sampleMediaType,
      });

  return {
    hasAlternateMediaPath,
    hasMediaReference,
    hasSelectedMediaPath,
    isDirect3dSample,
    mediaFieldPath,
    mimeType,
    nativeLookerType,
    selectedMediaPath,
  };
};

const getNativeLookerType = ({
  hasAlternateMediaPath,
  isDirect3dSample,
  mimeType,
  sampleMediaType,
}: NativeLookerSupport): NativeLookerType | null => {
  if (isDirect3dSample) {
    return "3d";
  }

  if (!hasAlternateMediaPath) {
    if (!isNativeMediaType(sampleMediaType)) {
      return null;
    }

    return sampleMediaType === MEDIA_TYPE_VIDEO ||
      mimeType?.startsWith("video/")
      ? "video"
      : "image";
  }

  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  if (mimeType?.startsWith("video/")) {
    return "video";
  }

  if (mimeType === null && sampleMediaType === MEDIA_TYPE_IMAGE) {
    return "image";
  }

  if (mimeType === null && sampleMediaType === MEDIA_TYPE_VIDEO) {
    return "video";
  }

  return null;
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
}: NativeLookerSupport): boolean =>
  getNativeLookerType({
    hasAlternateMediaPath,
    isDirect3dSample,
    mimeType,
    sampleMediaType,
  }) !== null;
