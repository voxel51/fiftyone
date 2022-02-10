/**
 * @generated SignedSource<<cd0a4f3273062730b922852e63bc54ce>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetsQuery$variables = {
  count?: number | null;
  cursor?: string | null;
};
export type DatasetsQueryVariables = DatasetsQuery$variables;
export type DatasetsQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsListingComponent_query">;
};
export type DatasetsQueryResponse = DatasetsQuery$data;
export type DatasetsQuery = {
  variables: DatasetsQueryVariables;
  response: DatasetsQuery$data;
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
      name: "DatasetsQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "DatasetsListingComponent_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetsQuery",
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
                      name: "id",
                      storageKey: null,
                    },
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
      cacheID: "13da52eb1aca12a937b3bc0543b03613",
      id: null,
      metadata: {},
      name: "DatasetsQuery",
      operationKind: "query",
      text:
        "query DatasetsQuery(\n  $count: Int = 10\n  $cursor: String\n) {\n  ...DatasetsListingComponent_query\n}\n\nfragment DatasetsListingCard_dataset on Dataset {\n  id\n  name\n}\n\nfragment DatasetsListingComponent_query on Query {\n  datasets(first: $count, after: $cursor) {\n    edges {\n      cursor\n      node {\n        ...DatasetsListingCard_dataset\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "ea9a025fa952f9ae5b80a010f382c400";

export default node;
