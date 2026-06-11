/**
 * The non-temporal {@link TemporalView}: with no frame store registered,
 * presence ≡ pool and the clock is inert by absence. The presence
 * stream never fires — non-temporal projection is driven entirely by the
 * semantic change stream.
 */

import { LabelType } from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";
import type { TemporalView } from "./types";

const ALL_LABEL_TYPES = Object.values(LabelType).filter(
  (type) => type !== LabelType.Unknown
);

interface PoolReads {
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[];
  getLabel(ref: LabelRef): unknown;
}

export class PoolTemporalView implements TemporalView {
  private pool: PoolReads;

  constructor(pool: PoolReads) {
    this.pool = pool;
  }

  getPresent(): readonly LabelRef[] {
    return this.pool.enumerateLabels(ALL_LABEL_TYPES);
  }

  isPresent(ref: LabelRef): boolean {
    return this.pool.getLabel(ref) !== undefined;
  }

  subscribePresence(): () => void {
    return () => undefined;
  }
}
