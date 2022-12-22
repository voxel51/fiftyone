/**
 * @generated SignedSource<<24e53aa5329ce0917b1c6346800c5909>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RootDatasetSavedViewsFragment$data = {
  readonly savedViews: ReadonlyArray<{
    readonly color: string | null;
    readonly createdAt: any | null;
    readonly datasetId: string | null;
    readonly description: string | null;
    readonly id: string | null;
    readonly lastLoadedAt: any | null;
    readonly lastModifiedAt: any | null;
    readonly name: string | null;
    readonly slug: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  }> | null;
  readonly " $fragmentType": "RootDatasetSavedViewsFragment";
};
export type RootDatasetSavedViewsFragment$key = {
  readonly " $data"?: RootDatasetSavedViewsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasetSavedViewsFragment">;
};

import RootDatasetSavedViewsFragmentQuery_graphql from './RootDatasetSavedViewsFragmentQuery.graphql';

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "name"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": RootDatasetSavedViewsFragmentQuery_graphql
    }
  },
  "name": "RootDatasetSavedViewsFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "datasetName",
          "variableName": "name"
        }
      ],
      "concreteType": "SavedView",
      "kind": "LinkedField",
      "name": "savedViews",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "id",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "datasetId",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "name",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "slug",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "description",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "color",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "viewStages",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "createdAt",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "lastModifiedAt",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "lastLoadedAt",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "00069e3f8442bb208462d061c825cab3";

export default node;
