/**
 * @generated SignedSource<<e9ca3804928c44af66865e9d1c973626>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetKeysFragment$data = {
  readonly getDatasetKeys: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  } | null;
  readonly " $fragmentType": "DatasetKeysFragment";
};
export type DatasetKeysFragment$key = {
  readonly " $data"?: DatasetKeysFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetKeysFragment">;
};

import DatasetKeysFragmentQuery_graphql from './DatasetKeysFragmentQuery.graphql';

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "nameOrSlug"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": DatasetKeysFragmentQuery_graphql
    }
  },
  "name": "DatasetKeysFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "nameOrSlug",
          "variableName": "nameOrSlug"
        }
      ],
      "concreteType": "DatasetKeys",
      "kind": "LinkedField",
      "name": "getDatasetKeys",
      "plural": false,
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
          "name": "name",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "slug",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "20d4d9447d9aa090078287e2ac788728";

export default node;
