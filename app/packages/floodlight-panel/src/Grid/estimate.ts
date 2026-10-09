type Metadata = Partial<
  Record<"width" | "height" | "frame_width" | "frame_height", unknown>
>;

/**
 * The bytes a looker holds for a sample, as it reports them once loaded: one
 * RGBA frame of its media. Undefined without media dimensions in its metadata.
 */
export const estimateBytes = (sample: unknown): number | undefined => {
  const metadata = (sample as { metadata?: Metadata } | undefined)?.metadata;
  const width = metadata?.width ?? metadata?.frame_width;
  const height = metadata?.height ?? metadata?.frame_height;
  return typeof width === "number" && typeof height === "number"
    ? width * height * 4
    : undefined;
};

// the engine's first fill shows the viewport and a viewport of padding, and
// holds them to a third of its budget until they validate
const FILL_VIEWPORTS = 2;
const FIRST_FILL_SHARE = 3;
const STEP = 0.5;

/**
 * The widest row aspect ratio, at most `rowAspect`, at which the estimated
 * bytes of a first fill pass the engine's validation. A row at aspect ratio r
 * is width / r tall and holds r / (mean item aspect) items, so a viewport
 * holds height × r² / (width × mean aspect) items.
 */
export const estimateRowAspect = ({
  budget,
  height,
  items,
  rowAspect,
  width,
}: {
  budget: number;
  height: number;
  items: Iterable<{ aspectRatio: number; bytes?: number }>;
  rowAspect: number;
  width: number;
}) => {
  let bytes = 0;
  let aspect = 0;
  let count = 0;
  for (const item of items) {
    if (item.bytes === undefined) continue;
    bytes += item.bytes;
    aspect += item.aspectRatio;
    count++;
  }
  if (!count || !bytes || !width || !height) return rowAspect;

  const fits = Math.sqrt(
    (budget / FIRST_FILL_SHARE) *
      ((width * aspect) / (FILL_VIEWPORTS * height * bytes)),
  );
  return fits >= rowAspect
    ? rowAspect
    : Math.max(1, Math.floor(fits / STEP) * STEP);
};
