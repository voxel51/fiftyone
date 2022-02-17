/**
 * @generated SignedSource<<03b6c51c2d317dd0b1f8e680a0cedefc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type RootQuery$variables = {
  count?: number | null;
  cursor?: string | null;
};
export type RootQueryVariables = RootQuery$variables;
export type RootQuery$data = {
  readonly viewer: {
    readonly id: string;
  };
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasets_query">;
};
export type RootQueryResponse = RootQuery$data;
export type RootQuery = {
  variables: RootQueryVariables;
  response: RootQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: 10,
        kind: "LocalArgument",
        name: "count",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "cursor",
      },
    ],
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "id",
      storageKey: null,
    },
    v2 = {
      alias: null,
      args: null,
      concreteType: "User",
      kind: "LinkedField",
      name: "viewer",
      plural: false,
      selections: [v1 /*: any*/],
      storageKey: null,
    },
    v3 = [
      {
        kind: "Variable",
        name: "after",
        variableName: "cursor",
      },
      {
        kind: "Variable",
        name: "first",
        variableName: "count",
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "RootQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "RootDatasets_query",
        },
        v2 /*: any*/,
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "RootQuery",
      selections: [
        {
          alias: null,
          args: v3 /*: any*/,
          concreteType: "DatasetConnection",
          kind: "LinkedField",
          name: "datasets",
          plural: false,
          selections: [
            {
              alias: null,
              args: null,
              concreteType: "DatasetEdge",
              kind: "LinkedField",
              name: "edges",
              plural: true,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "cursor",
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  concreteType: "Dataset",
                  kind: "LinkedField",
                  name: "node",
                  plural: false,
                  selections: [
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "name",
                      storageKey: null,
                    },
                    v1 /*: any*/,
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "__typename",
                      storageKey: null,
                    },
                  ],
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: "PageInfo",
              kind: "LinkedField",
              name: "pageInfo",
              plural: false,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "endCursor",
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "hasNextPage",
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
          ],
          storageKey: null,
        },
        {
          alias: null,
          args: v3 /*: any*/,
          filters: null,
          handle: "connection",
          key: "DatasetsList_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
        v2 /*: any*/,
      ],
    },
    params: {
      cacheID: "5008bc9639e7be4734caea32136232b0",
      id: null,
      metadata: {},
      name: "RootQuery",
      operationKind: "query",
      text:
        "query RootQuery(\n  $count: Int = 10\n  $cursor: String\n) {\n  ...RootDatasets_query\n  viewer {\n    id\n  }\n}\n\nfragment RootDatasets_query on Query {\n  datasets(first: $count, after: $cursor) {\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "144b399644aafc0829ed0741b4dbec9c";

export default node;
