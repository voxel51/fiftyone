import type { BaseState } from "../../state";
import { TagsElement } from "../common";

/**
 * Metadata thumbnails can appear in modal carousels. Restrict tag bubbles
 * to non-modal thumbnails so the behavior stays grid-only.
 */
export class MetadataGridTagsElement extends TagsElement<BaseState> {
  isShown({ thumbnail, isModal }: Readonly<BaseState["config"]>) {
    return thumbnail && !isModal;
  }
}
