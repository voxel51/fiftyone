/**
 * @generated SignedSource<<f83a98aea83bea88b16c38877616891c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewSchemaFragmentQuery$variables = {
  name: string;
  viewStages: Array;
};
export type viewSchemaFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"viewSchemaFragment">;
};
export type viewSchemaFragmentQuery = {
  response: viewSchemaFragmentQuery$data;
  variables: viewSchemaFragmentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "name"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "viewStages"
  }
],
v1 = [
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
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "viewSchemaFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "viewSchemaFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "viewSchemaFragmentQuery",
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
            "selections": (v1/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "frameFieldSchema",
            "plural": true,
            "selections": (v1/*: any*/),
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "7118f2ee6bf3a2a13e29bd0bc61b4bf0",
    "id": null,
    "metadata": {},
    "name": "viewSchemaFragmentQuery",
    "operationKind": "query",
    "text": "query viewSchemaFragmentQuery(\n  $name: String!\n  $viewStages: BSONArray!\n) {\n  ...viewSchemaFragment\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $viewStages) {\n    fieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n    frameFieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b744bc5d77c4fb64ec357da7669d4f0f";

export default node;
