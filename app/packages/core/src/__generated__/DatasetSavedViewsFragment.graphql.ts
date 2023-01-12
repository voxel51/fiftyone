/**
 * @generated SignedSource<<7d5c9301348ace97783a08d7f05b3f11>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetSavedViewsFragment$data = {
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
  readonly " $fragmentType": "DatasetSavedViewsFragment";
};
export type DatasetSavedViewsFragment$key = {
  readonly " $data"?: DatasetSavedViewsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetSavedViewsFragment">;
};

import DatasetSavedViewsFragmentQuery_graphql from './DatasetSavedViewsFragmentQuery.graphql';

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
      "operation": DatasetSavedViewsFragmentQuery_graphql
    }
  },
  "name": "DatasetSavedViewsFragment",
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

(node as any).hash = "c7972fa3f5796bad3d7d9766e6ea6d80";

export default node;
