/**
 * @generated SignedSource<<c37bdd6dd1f0485fa3938b607269bd4b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetsCountFragment$data = {
  readonly datasetsCount: number;
  readonly " $fragmentType": "DatasetsCountFragment";
};
export type DatasetsCountFragment$key = {
  readonly " $data"?: DatasetsCountFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsCountFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "filter"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": require('./DatasetsCountQuery.graphql')
    }
  },
  "name": "DatasetsCountFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "filter",
          "variableName": "filter"
        }
      ],
      "kind": "ScalarField",
      "name": "datasetsCount",
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "3137ee16b3b51cea83d23a4e1f73f5ad";

export default node;
