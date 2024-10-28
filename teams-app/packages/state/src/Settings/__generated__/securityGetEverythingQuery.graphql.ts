/**
 * @generated SignedSource<<659152a9535a4f0b02b7c77e375f1e9a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type securityGetEverythingQuery$variables = {};
export type securityGetEverythingQuery$data = {
  readonly roles: ReadonlyArray<{
    readonly attributes: ReadonlyArray<{
      readonly " $fragmentSpreads": FragmentRefs<"securityAttrFrag">;
    }>;
    readonly role: UserRole;
  }>;
};
export type securityGetEverythingQuery = {
  response: securityGetEverythingQuery$data;
  variables: securityGetEverythingQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "role",
  "storageKey": null
},
v1 = [
  {
    "kind": "Literal",
    "name": "exclude",
    "value": [
      "EXECUTE_BUILTIN_PLUGINS"
    ]
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "attribute",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "display",
  "storageKey": null
},
v4 = {
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
    "name": "securityGetEverythingQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "UserRoleInfo",
        "kind": "LinkedField",
        "name": "roles",
        "plural": true,
        "selections": [
          (v0/*: any*/),
          {
            "alias": null,
            "args": (v1/*: any*/),
            "concreteType": null,
            "kind": "LinkedField",
            "name": "attributes",
            "plural": true,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "securityAttrFrag"
              }
            ],
            "storageKey": "attributes(exclude:[\"EXECUTE_BUILTIN_PLUGINS\"])"
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
    "name": "securityGetEverythingQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "UserRoleInfo",
        "kind": "LinkedField",
        "name": "roles",
        "plural": true,
        "selections": [
          (v0/*: any*/),
          {
            "alias": null,
            "args": (v1/*: any*/),
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
                  (v2/*: any*/),
                  (v3/*: any*/),
                  (v4/*: any*/),
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
                  (v2/*: any*/),
                  (v3/*: any*/),
                  (v4/*: any*/),
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
                  (v2/*: any*/),
                  (v3/*: any*/),
                  (v4/*: any*/),
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
            "storageKey": "attributes(exclude:[\"EXECUTE_BUILTIN_PLUGINS\"])"
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "612bc3434e41f2910cf6afc2ed0a49a9",
    "id": null,
    "metadata": {},
    "name": "securityGetEverythingQuery",
    "operationKind": "query",
    "text": "query securityGetEverythingQuery {\n  roles {\n    role\n    attributes(exclude: [EXECUTE_BUILTIN_PLUGINS]) {\n      __typename\n      ...securityAttrFrag\n    }\n  }\n}\n\nfragment securityAttrFrag on UserAttributeInfo {\n  __isUserAttributeInfo: __typename\n  ... on BoolUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    boolValue: value\n    boolOptions: options\n  }\n  ... on DatasetAccessLevelUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    accessLevelValue: value\n    accessLevelOptions: options\n  }\n  ... on DatasetPermissionUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    permissionValue: value\n    permissionOptions: options\n  }\n}\n"
  }
};
})();

(node as any).hash = "11a1f15065d5fcf0ee3f7058edd5d4a8";

export default node;
