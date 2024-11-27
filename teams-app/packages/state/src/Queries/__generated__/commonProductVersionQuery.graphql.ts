/**
 * @generated SignedSource<<638b0db3a3a091f70ee007d0f63a235e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type commonProductVersionQuery$variables = {};
export type commonProductVersionQuery$data = {
  readonly version: string;
};
export type commonProductVersionQuery = {
  response: commonProductVersionQuery$data;
  variables: commonProductVersionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "version",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "commonProductVersionQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "commonProductVersionQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "cfb041e182a54975cd47ea6601842865",
    "id": null,
    "metadata": {},
    "name": "commonProductVersionQuery",
    "operationKind": "query",
    "text": "query commonProductVersionQuery {\n  version\n}\n"
  }
};
})();

(node as any).hash = "e2b9e61d808ec568ea37de26b08ab651";

export default node;
