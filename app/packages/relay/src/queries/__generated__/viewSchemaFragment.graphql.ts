/**
 * @generated SignedSource<<add70884bae39830061041624d34323e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewSchemaFragment$data = {
  readonly schemaForViewStages: {
    readonly fieldSchema: ReadonlyArray<{
      readonly description: string | null;
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly info: object | null;
      readonly path: string;
      readonly subfield: string | null;
    }>;
    readonly frameFieldSchema: ReadonlyArray<{
      readonly description: string | null;
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly info: object | null;
      readonly path: string;
      readonly subfield: string | null;
    }>;
  };
  readonly " $fragmentType": "viewSchemaFragment";
};
export type viewSchemaFragment$key = {
  readonly " $data"?: viewSchemaFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"viewSchemaFragment">;
};

import viewSchemaFragmentQuery_graphql from './viewSchemaFragmentQuery.graphql';

const node: ReaderFragment = (function(){
var v0 = [
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
];
return {
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
      "concreteType": "SchemaResult",
      "kind": "LinkedField",
      "name": "schemaForViewStages",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "concreteType": "SampleField",
          "kind": "LinkedField",
          "name": "fieldSchema",
          "plural": true,
          "selections": (v0/*: any*/),
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "SampleField",
          "kind": "LinkedField",
          "name": "frameFieldSchema",
          "plural": true,
          "selections": (v0/*: any*/),
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "b744bc5d77c4fb64ec357da7669d4f0f";

export default node;
