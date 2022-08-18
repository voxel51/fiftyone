/**
 * @generated SignedSource<<f628127b11f43a54687541906cd933e8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type paginateGroupPinnedSample_query$data = {
  readonly sample:
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
  readonly " $fragmentType": "paginateGroupPinnedSample_query";
};
export type paginateGroupPinnedSample_query$key = {
  readonly " $data"?: paginateGroupPinnedSample_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroupPinnedSample_query">;
};

const node: ReaderFragment = (function () {
  var v0 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "aspectRatio",
      storageKey: null,
    },
    v1 = {
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
    metadata: null,
    name: "paginateGroupPinnedSample_query",
    selections: [
      {
        kind: "RequiredField",
        field: {
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
              selections: [v0 /*: any*/, v1 /*: any*/],
              type: "ImageSample",
              abstractKey: null,
            },
            {
              kind: "InlineFragment",
              selections: [v1 /*: any*/],
              type: "PointCloudSample",
              abstractKey: null,
            },
            {
              kind: "InlineFragment",
              selections: [
                v0 /*: any*/,
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "frameRate",
                  storageKey: null,
                },
                v1 /*: any*/,
              ],
              type: "VideoSample",
              abstractKey: null,
            },
          ],
          storageKey: null,
        },
        action: "THROW",
        path: "sample",
      },
    ],
    type: "Query",
    abstractKey: null,
  };
})();

(node as any).hash = "5ff580beb470ab9b3a7399cc73d28675";

export default node;
