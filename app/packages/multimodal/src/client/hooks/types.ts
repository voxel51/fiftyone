/**
 * Async load state returned by multimodal query hooks.
 */
export type MultimodalQueryState<Data> =
  | {
      readonly data: null;
      readonly error: null;
      readonly status: "idle" | "loading";
    }
  | {
      readonly data: Data;
      readonly error: null;
      readonly status: "loaded";
    }
  | {
      readonly data: null;
      readonly error: Error;
      readonly status: "error";
    };
