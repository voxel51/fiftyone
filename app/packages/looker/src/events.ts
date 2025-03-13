/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export const FO_LABEL_HOVERED_EVENT = "fo:labelHovered";
export const FO_LABEL_UNHOVERED_EVENT = "fo:labelUnhovered";

export type InstanceId = string;
export type LabelId = string;

export type LabelEventData = {
  field: string;
  instanceId: InstanceId;
  labelId: LabelId;
  frameNumber?: number;
};

export class LabelHoveredEvent extends CustomEvent<LabelEventData> {
  constructor(readonly label: LabelEventData) {
    super(FO_LABEL_HOVERED_EVENT, { detail: label });
  }
}

export class LabelUnhoveredEvent extends CustomEvent<null> {
  constructor() {
    super(FO_LABEL_UNHOVERED_EVENT);
  }
}
