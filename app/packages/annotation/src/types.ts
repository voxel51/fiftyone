import { Primitive } from "@fiftyone/utilities";

/**
 * Operation type.
 */
export type OpType = "mutate" | "delete" | "add";

export type Mutation = {
  data: Primitive;
  op?: OpType;
};
