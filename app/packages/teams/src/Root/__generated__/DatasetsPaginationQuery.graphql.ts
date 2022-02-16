/**
 * @generated SignedSource<<fc27484167af96ab93870fdc8d533254>>
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
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasets_query">;
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
          name: "RootDatasets_query",
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
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "id",
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
          key: "DatasetsList_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
      ],
    },
    params: {
      cacheID: "216fd414cb7acadab8e10d0d38e90247",
      id: null,
      metadata: {},
      name: "DatasetsPaginationQuery",
      operationKind: "query",
      text:
        "query DatasetsPaginationQuery(\n  $count: Int\n  $cursor: String\n) {\n  ...RootDatasets_query\n}\n\nfragment RootDatasets_query on Query {\n  datasets(first: $count, after: $cursor) {\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "04face7b25aed322240f032c60955faf";

export default node;
