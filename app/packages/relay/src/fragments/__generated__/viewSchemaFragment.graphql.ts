/**
 * @generated SignedSource<<a105fd1d249e75a22c556e799768e4cd>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewSchemaFragment$data = {
  readonly schemaForViewStages: {
    readonly fieldSchema: ReadonlyArray<{
      readonly description: string | null | undefined;
      readonly embeddedDocType: string | null | undefined;
      readonly ftype: string;
      readonly info: object | null | undefined;
      readonly path: string;
      readonly subfield: string | null | undefined;
    }>;
    readonly frameFieldSchema: ReadonlyArray<{
      readonly description: string | null | undefined;
      readonly embeddedDocType: string | null | undefined;
      readonly ftype: string;
      readonly info: object | null | undefined;
      readonly path: string;
      readonly subfield: string | null | undefined;
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
          "selections": (v0/*:: as any*/),
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "SampleField",
          "kind": "LinkedField",
          "name": "frameFieldSchema",
          "plural": true,
          "selections": (v0/*:: as any*/),
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
