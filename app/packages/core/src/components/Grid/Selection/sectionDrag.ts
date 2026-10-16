import type { DragEvent } from "react";

/**
 * The drag a tray card carries to another section. Its own type keeps any
 * other drag, of a file or text, from reading as a section drop.
 */
const SECTION_DRAG_TYPE = "application/x-fiftyone-section-card";

/** Which parent a card drag carries, and the section it leaves. */
export interface SectionDrag {
  readonly episodeId: string;
  readonly from: string;
}

/** Starts a card drag that a section can take as a move or a copy. */
export function startSectionDrag(event: DragEvent, drag: SectionDrag) {
  event.dataTransfer.setData(SECTION_DRAG_TYPE, JSON.stringify(drag));
  event.dataTransfer.effectAllowed = "copyMove";
}

/**
 * Whether a drag carries a card. Only its type is readable until the drop,
 * so this is all a section can know while one passes over it.
 */
export function isSectionDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(SECTION_DRAG_TYPE);
}

/** The card a drop carries, or null for any other drop. */
export function readSectionDrag(event: DragEvent): SectionDrag | null {
  const raw = event.dataTransfer.getData(SECTION_DRAG_TYPE);
  return raw ? (JSON.parse(raw) as SectionDrag) : null;
}
