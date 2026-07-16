/**
 * Diagonal ruler glyph shared by the point-cloud and map measure toggles —
 * voodo's icon set has no ruler. Decorative: host buttons carry the
 * accessible label.
 */
export default function MeasureRulerIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="13"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="13"
    >
      <path d="M3 17 17 3l4 4L7 21z" />
      <path d="m8 12 2 2" />
      <path d="m11 9 2 2" />
      <path d="m14 6 2 2" />
    </svg>
  );
}
