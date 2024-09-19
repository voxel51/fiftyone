/**
 * @generated SignedSource<<4bddf3dd40d363351dae7d8b98df6680>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type UserQuery$variables = {};
export type UserQuery$data = {
  readonly viewer: {
    readonly apiKeys: ReadonlyArray<{
      readonly createdAt: string;
      readonly id: string;
      readonly name: string;
    }>;
    readonly attributes: ReadonlyArray<{
      readonly " $fragmentSpreads": FragmentRefs<"UserAttrFrag">;
    }>;
    readonly email: string;
    readonly id: string;
    readonly name: string;
    readonly picture: string | null;
    readonly role: UserRole;
  } | null;
};
export type UserQuery = {
  response: UserQuery$data;
  variables: UserQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "concreteType": "APIKey",
  "kind": "LinkedField",
  "name": "apiKeys",
  "plural": true,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "createdAt",
      "storageKey": null
    },
    (v0/*: any*/),
    (v1/*: any*/)
  ],
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "picture",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "role",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "email",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "attribute",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "display",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "UserQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/),
          (v1/*: any*/),
          (v0/*: any*/),
          (v5/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "attributes",
            "plural": true,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "UserAttrFrag"
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "UserQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/),
          (v1/*: any*/),
          (v0/*: any*/),
          (v5/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "attributes",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "__typename",
                "storageKey": null
              },
              {
                "kind": "TypeDiscriminator",
                "abstractKey": "__isUserAttributeInfo"
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  (v6/*: any*/),
                  (v7/*: any*/),
                  (v8/*: any*/),
                  {
                    "alias": "boolValue",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "value",
                    "storageKey": null
                  },
                  {
                    "alias": "boolOptions",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "options",
                    "storageKey": null
                  }
                ],
                "type": "BoolUserAttributeInfo",
                "abstractKey": null
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  (v6/*: any*/),
                  (v7/*: any*/),
                  (v8/*: any*/),
                  {
                    "alias": "accessLevelValue",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "value",
                    "storageKey": null
                  },
                  {
                    "alias": "accessLevelOptions",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "options",
                    "storageKey": null
                  }
                ],
                "type": "DatasetAccessLevelUserAttributeInfo",
                "abstractKey": null
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  (v6/*: any*/),
                  (v7/*: any*/),
                  (v8/*: any*/),
                  {
                    "alias": "permissionValue",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "value",
                    "storageKey": null
                  },
                  {
                    "alias": "permissionOptions",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "options",
                    "storageKey": null
                  }
                ],
                "type": "DatasetPermissionUserAttributeInfo",
                "abstractKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "e9ca7c37e62914914bef7741249e60fe",
    "id": null,
    "metadata": {},
    "name": "UserQuery",
    "operationKind": "query",
    "text": "query UserQuery {\n  viewer {\n    apiKeys {\n      createdAt\n      id\n      name\n    }\n    picture\n    role\n    name\n    id\n    email\n    attributes {\n      __typename\n      ...UserAttrFrag\n    }\n  }\n}\n\nfragment UserAttrFrag on UserAttributeInfo {\n  __isUserAttributeInfo: __typename\n  ... on BoolUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    boolValue: value\n    boolOptions: options\n  }\n  ... on DatasetAccessLevelUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    accessLevelValue: value\n    accessLevelOptions: options\n  }\n  ... on DatasetPermissionUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    permissionValue: value\n    permissionOptions: options\n  }\n}\n"
  }
};
})();

(node as any).hash = "08de04d5d86b95446f0ff0dc43ca5213";

export default node;
