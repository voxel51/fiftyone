/**
 * @generated SignedSource<<cd7ebbd9dc14e50f315beae1468cf816>>
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
    readonly createdAt: any;
    readonly datasetId: string;
    readonly description: string | null;
    readonly id: string | null;
    readonly lastLoadedAt: any | null;
    readonly lastModifiedAt: any | null;
    readonly name: string;
    readonly urlName: string;
    readonly viewStages: ReadonlyArray<string>;
  }>;
  readonly " $fragmentType": "RootDatasetSavedViewsFragment";
};
export type RootDatasetSavedViewsFragment$key = {
  readonly " $data"?: RootDatasetSavedViewsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasetSavedViewsFragment">;
};

import EootDatasetSavedViewsQuery_graphql from './EootDatasetSavedViewsQuery.graphql';

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
      "operation": EootDatasetSavedViewsQuery_graphql
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
          "name": "urlName",
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

(node as any).hash = "847f8eba4c04caaab427bb5c7b7accce";

export default node;
