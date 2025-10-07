/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import { BaseOverlay } from "./BaseOverlay";

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  id: string;
  field: string;
}

/**
 * Classification overlay implementation with selection support.
 */
export class ClassificationOverlay extends BaseOverlay {
  constructor(options: ClassificationOptions) {
    super(options.id, options.field);
  }

  getOverlayType(): string {
    return "ClassificationOverlay";
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D): void {}

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.CLASSIFICATION;
  }
}
