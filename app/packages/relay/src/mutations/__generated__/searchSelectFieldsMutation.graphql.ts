/**
 * @generated SignedSource<<6aeac381594064ae7f8e58c8a3972720>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type searchSelectFieldsMutation$variables = {
  metaFilter?: object | null;
};
export type searchSelectFieldsMutation$data = {
  readonly searchSelectFields: ReadonlyArray<{
    readonly path: string;
  } | null>;
};
export type searchSelectFieldsMutation = {
  response: searchSelectFieldsMutation$data;
  variables: searchSelectFieldsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "metaFilter"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "metaFilter",
        "variableName": "metaFilter"
      }
    ],
    "concreteType": "SampleField",
    "kind": "LinkedField",
    "name": "searchSelectFields",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "path",
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
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "05ffc3bc35bab390474fc9a2190d0b88",
    "id": null,
    "metadata": {},
    "name": "searchSelectFieldsMutation",
    "operationKind": "mutation",
    "text": "mutation searchSelectFieldsMutation(\n  $metaFilter: JSON = null\n) {\n  searchSelectFields(metaFilter: $metaFilter) {\n    path\n  }\n}\n"
  }
};
})();

(node as any).hash = "81e6b8da8399868f5d70bd599e40ac5f";

export default node;
