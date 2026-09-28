/**
 * @generated SignedSource<<3418f3a64dd42b5bb03902b1011e1e7f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type viewBarSchemaQuery$variables = {
  name: string;
  view: Array;
};
export type viewBarSchemaQuery$data = {
  readonly schemaForViewStages: {
    readonly fieldSchema: ReadonlyArray<{
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly path: string;
      readonly subfield: string | null;
    }>;
    readonly frameFieldSchema: ReadonlyArray<{
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly path: string;
      readonly subfield: string | null;
    }>;
  };
};
export type viewBarSchemaQuery = {
  response: viewBarSchemaQuery$data;
  variables: viewBarSchemaQuery$variables;
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
    "name": "view"
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
  }
],
v2 = [
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
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "viewBarSchemaQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "viewBarSchemaQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "425ecf201106108159ae2a6fe89e5160",
    "id": null,
    "metadata": {},
    "name": "viewBarSchemaQuery",
    "operationKind": "query",
    "text": "query viewBarSchemaQuery(\n  $name: String!\n  $view: BSONArray!\n) {\n  schemaForViewStages(datasetName: $name, viewStages: $view) {\n    fieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n    }\n    frameFieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "ef35ffbd87ccdbaacadac9f33b7ae362";

export default node;
