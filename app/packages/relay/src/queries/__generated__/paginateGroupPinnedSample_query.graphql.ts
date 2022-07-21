/**
 * @generated SignedSource<<70930286c6b27df9e86870bda6371ed7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type paginateGroupPinnedSample_query$data = {
  readonly sample:
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
      }
    | null;
  readonly " $fragmentType": "paginateGroupPinnedSample_query";
};
export type paginateGroupPinnedSample_query$key = {
  readonly " $data"?: paginateGroupPinnedSample_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroupPinnedSample_query">;
};

import paginateGroupPinnedSampleQuery_graphql from "./paginateGroupPinnedSampleQuery.graphql";

const node: ReaderFragment = (function () {
  var v0 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v2 = {
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
        name: "dataset",
      },
      {
        kind: "RootArgument",
        name: "pinnedSampleFilter",
      },
      {
        kind: "RootArgument",
        name: "view",
      },
    ],
    kind: "Fragment",
    metadata: {
      refetch: {
        connection: null,
        fragmentPathInResult: [],
        operation: paginateGroupPinnedSampleQuery_graphql,
      },
    },
    name: "paginateGroupPinnedSample_query",
    selections: [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "dataset",
            variableName: "dataset",
          },
          {
            kind: "Variable",
            name: "filter",
            variableName: "pinnedSampleFilter",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        concreteType: null,
        kind: "LinkedField",
        name: "sample",
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
            selections: [v0 /*: any*/, v1 /*: any*/, v2 /*: any*/],
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
              v0 /*: any*/,
              v1 /*: any*/,
              v2 /*: any*/,
            ],
            type: "VideoSample",
            abstractKey: null,
          },
        ],
        storageKey: null,
      },
    ],
    type: "Query",
    abstractKey: null,
  };
})();

(node as any).hash = "352b83af7f916730f87b23113c220e1e";

export default node;
