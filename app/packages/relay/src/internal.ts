import { GraphQLTaggedNode } from "relay-runtime";

export const store_INTERNAL = new Map<
  string,
  {
    fragments: GraphQLTaggedNode[];
    keys?: string[];
    reader: (value: unknown) => unknown;
  }
>();
