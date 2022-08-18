/**
 * @generated SignedSource<<89ab927b7b20f31b25218c10824f51de>>
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
            readonly aspectRatio: number;
            readonly sample: object;
          }
        | {
            readonly __typename: "PointCloudSample";
            readonly sample: object;
          }
        | {
            readonly __typename: "VideoSample";
            readonly aspectRatio: number;
            readonly frameRate: number;
            readonly sample: object;
          }
        | {
            // This will never be '%other', but we need some
            // value in case none of the concrete values match.
            readonly __typename: "%other";
          };
    }>;
    readonly total: number | null;
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
      name: "aspectRatio",
      storageKey: null,
    },
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
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
        name: "filter",
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
            name: "filter",
            variableName: "filter",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        concreteType: "SampleItemStrConnection",
        kind: "LinkedField",
        name: "__paginateGroup_query_samples_connection",
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "total",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "SampleItemStrEdge",
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
                    selections: [v1 /*: any*/, v2 /*: any*/],
                    type: "ImageSample",
                    abstractKey: null,
                  },
                  {
                    kind: "InlineFragment",
                    selections: [v2 /*: any*/],
                    type: "PointCloudSample",
                    abstractKey: null,
                  },
                  {
                    kind: "InlineFragment",
                    selections: [
                      v1 /*: any*/,
                      {
                        alias: null,
                        args: null,
                        kind: "ScalarField",
                        name: "frameRate",
                        storageKey: null,
                      },
                      v2 /*: any*/,
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
            concreteType: "SampleItemStrPageInfo",
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

(node as any).hash = "5d0f0fb34624c33ec148745af357c70e";

export default node;
