/**
 * @generated SignedSource<<6879697853ba486089d98953d6e39509>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type HomeComponent_query$data = {
  readonly datasets: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly name: string;
      };
    }>;
  };
  readonly " $fragmentType": "HomeComponent_query";
};
export type HomeComponent_query = HomeComponent_query$data;
export type HomeComponent_query$key = {
  readonly " $data"?: HomeComponent_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"HomeComponent_query">;
};

import DatasetsPaginationQuery_graphql from "./DatasetsPaginationQuery.graphql";
const node: ReaderFragment = (function () {
  var v0 = ["datasets"];
  return {
    argumentDefinitions: [
      {
        kind: "RootArgument",
        name: "count",
      },
      {
        kind: "RootArgument",
        name: "cursor",
      },
    ],
    kind: "Fragment",
    metadata: {
      connection: [
        {
          count: "count",
          cursor: "cursor",
          direction: "forward",
          path: v0 /*: any*/,
        },
      ],
      refetch: {
        connection: {
          forward: {
            count: "count",
            cursor: "cursor",
          },
          backward: null,
          path: v0 /*: any*/,
        },
        fragmentPathInResult: [],
        operation: DatasetsPaginationQuery_graphql,
      },
    },
    name: "HomeComponent_query",
    selections: [
      {
        alias: "datasets",
        args: null,
        concreteType: "DatasetConnection",
        kind: "LinkedField",
        name: "__DatasetList_query_datasets_connection",
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
    ],
    type: "Query",
    abstractKey: null,
  };
})();

(node as any).hash = "6b66187e50519470cc3da0585958b320";

export default node;
