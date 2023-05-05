/**
 * @generated SignedSource<<3d51542969e7e3d1beec81603338f1d1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type SchemaSettingsViewSchemaFragment$data = {
  readonly schemaForViewStages: ReadonlyArray<string> | null;
  readonly " $fragmentType": "SchemaSettingsViewSchemaFragment";
};
export type SchemaSettingsViewSchemaFragment$key = {
  readonly " $data"?: SchemaSettingsViewSchemaFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"SchemaSettingsViewSchemaFragment">;
};

import ViewSchemaFragmentQuery_graphql from './ViewSchemaFragmentQuery.graphql';

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "name"
    },
    {
      "kind": "RootArgument",
      "name": "viewStages"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": ViewSchemaFragmentQuery_graphql
    }
  },
  "name": "SchemaSettingsViewSchemaFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "datasetName",
          "variableName": "name"
        },
        {
          "kind": "Variable",
          "name": "viewStages",
          "variableName": "viewStages"
        }
      ],
      "kind": "ScalarField",
      "name": "schemaForViewStages",
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "cb6d4872180060fd4ba56d77a5cce24c";

export default node;
