/**
 * @generated SignedSource<<e82807cf666ed1de0d6560ab526a0a33>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewSchemaFragment$data = {
  readonly schemaForViewStages: ReadonlyArray<{
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: object | null;
    readonly path: string;
    readonly subfield: string | null;
  }>;
  readonly " $fragmentType": "viewSchemaFragment";
};
export type viewSchemaFragment$key = {
  readonly " $data"?: viewSchemaFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"viewSchemaFragment">;
};

import viewSchemaFragmentQuery_graphql from './viewSchemaFragmentQuery.graphql';

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
      "operation": viewSchemaFragmentQuery_graphql
    }
  },
  "name": "viewSchemaFragment",
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
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "schemaForViewStages",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "path",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "ftype",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "subfield",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "embeddedDocType",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "info",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "description",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "f0d986e992cfda1ea89e036a79e55e81";

export default node;
