/**
 * @generated SignedSource<<157eb1b796de3fe599c8d412a0a5f553>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetsPaginationQuery$variables = {
  count?: number | null;
  cursor?: string | null;
};
export type DatasetsPaginationQueryVariables = DatasetsPaginationQuery$variables;
export type DatasetsPaginationQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"HomeComponent_query">;
};
export type DatasetsPaginationQueryResponse = DatasetsPaginationQuery$data;
export type DatasetsPaginationQuery = {
  variables: DatasetsPaginationQueryVariables;
  response: DatasetsPaginationQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "count",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "cursor",
      },
    ],
    v1 = [
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
      name: "DatasetsPaginationQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "HomeComponent_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetsPaginationQuery",
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
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
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "cursor",
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
          args: v1 /*: any*/,
          filters: null,
          handle: "connection",
          key: "DatasetList_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
      ],
    },
    params: {
      cacheID: "c22032c5c99a0135ff93f1a57cb8caf8",
      id: null,
      metadata: {},
      name: "DatasetsPaginationQuery",
      operationKind: "query",
      text:
        "query DatasetsPaginationQuery(\n  $count: Int\n  $cursor: String\n) {\n  ...HomeComponent_query\n}\n\nfragment HomeComponent_query on Query {\n  datasets(first: $count, after: $cursor) {\n    edges {\n      node {\n        name\n        __typename\n      }\n      cursor\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "6b66187e50519470cc3da0585958b320";

export default node;
