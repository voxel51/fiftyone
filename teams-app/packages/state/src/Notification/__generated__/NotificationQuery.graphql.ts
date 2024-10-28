/**
 * @generated SignedSource<<993d0f6ac37b4a65e15ba58b7e6ac58b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NotificationQuery$variables = {};
export type NotificationQuery$data = {
  readonly notifications: ReadonlyArray<{
    readonly " $fragmentSpreads": FragmentRefs<"NotificationFrag">;
  }>;
};
export type NotificationQuery = {
  response: NotificationQuery$data;
  variables: NotificationQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "kind": "Literal",
    "name": "filter",
    "value": {
      "kinds": [
        "GLOBAL"
      ],
      "read": false
    }
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "NotificationQuery",
    "selections": [
      {
        "alias": null,
        "args": (v0/*: any*/),
        "concreteType": "Notification",
        "kind": "LinkedField",
        "name": "notifications",
        "plural": true,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "NotificationFrag"
          }
        ],
        "storageKey": "notifications(filter:{\"kinds\":[\"GLOBAL\"],\"read\":false})"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "NotificationQuery",
    "selections": [
      {
        "alias": null,
        "args": (v0/*: any*/),
        "concreteType": "Notification",
        "kind": "LinkedField",
        "name": "notifications",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "kind",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "code",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "level",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "title",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "details",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "read",
            "storageKey": null
          }
        ],
        "storageKey": "notifications(filter:{\"kinds\":[\"GLOBAL\"],\"read\":false})"
      }
    ]
  },
  "params": {
    "cacheID": "a9928950b49d2e249729fd85b68d9fb3",
    "id": null,
    "metadata": {},
    "name": "NotificationQuery",
    "operationKind": "query",
    "text": "query NotificationQuery {\n  notifications(filter: {kinds: [GLOBAL], read: false}) {\n    ...NotificationFrag\n  }\n}\n\nfragment NotificationFrag on Notification {\n  kind\n  code\n  level\n  title\n  details\n  read\n}\n"
  }
};
})();

(node as any).hash = "406729f4162103f8230c3578e14bcc20";

export default node;
