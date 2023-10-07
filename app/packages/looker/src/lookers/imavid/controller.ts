import { ImaVidStore } from "@fiftyone/state/src/hooks/useImaVid";

export class ImaVidFramesController {
  constructor(
    public readonly store: ImaVidStore,
    public readonly fetchMore: any
  ) {}
}
