/**
 * Pluralize a unit string: adds "s" for most words, "es" for "patch".
 */
export const pluralizeUnit = (count: number, unit: string): string =>
  `${count} ${count === 1 ? unit : unit + (unit === "patch" ? "es" : "s")}`;

/**
 * Build a default display name for a similarity search run.
 *
 * - Text queries: return the raw query string
 * - Upload queries: "1 image" / "0 images"
 * - Image queries: "N samples" / "N patches" with optional negative counts
 */
export function buildSimilarityRunName({
  isImageSearch,
  isUpload,
  textQuery,
  queryIds,
  negativeQueryIds,
  patchesField,
  hasUploadedImage,
}: {
  isImageSearch: boolean;
  isUpload?: boolean;
  textQuery?: string;
  queryIds?: string[] | string;
  negativeQueryIds?: string[];
  patchesField?: string;
  hasUploadedImage?: boolean;
}): string {
  if (isUpload) {
    const count = hasUploadedImage ? 1 : 0;
    return `${count} ${count === 1 ? "image" : "images"}`;
  }

  if (!isImageSearch) {
    return textQuery?.trim() || "text query";
  }

  const count = Array.isArray(queryIds) ? queryIds.length : queryIds ? 1 : 0;
  const negCount = negativeQueryIds?.length ?? 0;
  const unit = patchesField ? "patch" : "sample";

  if (negCount > 0) {
    return `${pluralizeUnit(count, unit)} positive, ${pluralizeUnit(
      negCount,
      unit
    )} negative`;
  }

  return pluralizeUnit(count, unit);
}

export function formatValueAsNumber(
  value: string | number,
  fractionDigits = 3
) {
  const numericValue =
    typeof value === "number" ? value : parseFloat(value as string);
  if (!isNaN(numericValue) && numericValue == value) {
    return parseFloat(numericValue.toFixed(fractionDigits));
  }
  return value;
}
