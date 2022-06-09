/**
 * @generated SignedSource<<7c6ec27894e1aac69b5d25002e2d181b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type paginateGroup_query$data = {
  readonly samples: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node:
        | {
            readonly __typename: "ImageSample";
            readonly height: number;
            readonly sample: object;
            readonly width: number;
          }
        | {
            readonly __typename: "VideoSample";
            readonly frameRate: number;
            readonly height: number;
            readonly sample: object;
            readonly width: number;
          }
        | {
            // This will never be '%other', but we need some
            // value in case none of the concrete values match.
            readonly __typename: "%other";
          };
    }>;
  };
  readonly " $fragmentType": "paginateGroup_query";
};
export type paginateGroup_query$key = {
  readonly " $data"?: paginateGroup_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroup_query">;
};

import paginateGroupPageQuery_graphql from "./paginateGroupPageQuery.graphql";
const node: ReaderFragment = (function () {
  var v0 = ["samples"],
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "width",
      storageKey: null,
    };
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
      {
        kind: "RootArgument",
        name: "dataset",
      },
      {
        kind: "RootArgument",
        name: "view",
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
        operation: paginateGroupPageQuery_graphql,
      },
    },
    name: "paginateGroup_query",
    selections: [
      {
        alias: "samples",
        args: [
          {
            kind: "Variable",
            name: "dataset",
            variableName: "dataset",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        concreteType: "SampleItemConnection",
        kind: "LinkedField",
        name: "__paginateGroup_query_samples_connection",
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            concreteType: "SampleItemEdge",
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
                concreteType: null,
                kind: "LinkedField",
                name: "node",
                plural: false,
                selections: [
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "__typename",
                    storageKey: null,
                  },
                  {
                    kind: "InlineFragment",
                    selections: [v1 /*: any*/, v2 /*: any*/, v3 /*: any*/],
                    type: "ImageSample",
                    abstractKey: null,
                  },
                  {
                    kind: "InlineFragment",
                    selections: [
                      {
                        alias: null,
                        args: null,
                        kind: "ScalarField",
                        name: "frameRate",
                        storageKey: null,
                      },
                      v1 /*: any*/,
                      v2 /*: any*/,
                      v3 /*: any*/,
                    ],
                    type: "VideoSample",
                    abstractKey: null,
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
    ],
    type: "Query",
    abstractKey: null,
  };
})();

(node as any).hash = "1baec3bb8a5ab767caef58ccff94602f";

export default node;
