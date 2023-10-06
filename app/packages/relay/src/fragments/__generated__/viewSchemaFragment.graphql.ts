/**
 * @generated SignedSource<<2fbe02e39ce04bc0d59ab85750ce2c85>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
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
      "name": "view"
    }
  ],
  "kind": "Fragment",
  "metadata": null,
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
          "variableName": "view"
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

(node as any).hash = "22945eebda27b7d001d3b969f23c71e6";

export default node;
