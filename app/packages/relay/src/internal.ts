import { GraphQLTaggedNode } from "relay-runtime";

export const stores_INTERNAL = new Map<
  string,
  Map<
    string,
    {
      fragments: GraphQLTaggedNode[];
      keys?: string[];
      reader: (value: unknown) => unknown;
    }
  >
>();
