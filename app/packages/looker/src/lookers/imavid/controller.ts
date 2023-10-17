import * as fos from "@fiftyone/state";
import LRUCache from "lru-cache";

export class ImaVidFramesController {
  constructor(
    public readonly posterSampleRef: React.RefObject<
      fos.ModalSample["sample"]["sample"] | null
    >,
    public readonly store: LRUCache<string, fos.FrameSamples>,
    public readonly fetchMore: (cursor: number, limit?: number) => Promise<void>
  ) {}

  get posterSampleId() {
    if (!this.posterSampleRef.current) {
      throw new Error("poster sample invalid / not set");
    }
    return this.posterSampleRef.current._id as string;
  }

  public async hydrateIfEmpty() {
    if (!this.posterSampleId) {
      throw new Error("poster sample invalid / not set");
    }

    console.log("Hydrating store for sample", this.posterSampleId);

    if (!this.store.has(this.posterSampleId)) {
      return this.fetchMore(0);
    }
  }
}
