/**
 * @generated SignedSource<<316142d739ef4a823ce0dc7d960d7436>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type securityGetBySpecificAttributeQuery$variables = {};
export type securityGetBySpecificAttributeQuery$data = {
  readonly roles: ReadonlyArray<{
    readonly attribute: {
      readonly " $fragmentSpreads": FragmentRefs<"securityAttrFrag">;
    };
    readonly role: UserRole;
  }>;
};
export type securityGetBySpecificAttributeQuery = {
  response: securityGetBySpecificAttributeQuery$data;
  variables: securityGetBySpecificAttributeQuery$variables;
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
    "name": "attribute",
    "value": "MAX_DATASET_PERMISSION"
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
    "name": "securityGetBySpecificAttributeQuery",
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
            "name": "attribute",
            "plural": false,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "securityAttrFrag"
              }
            ],
            "storageKey": "attribute(attribute:\"MAX_DATASET_PERMISSION\")"
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
    "name": "securityGetBySpecificAttributeQuery",
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
            "name": "attribute",
            "plural": false,
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
            "storageKey": "attribute(attribute:\"MAX_DATASET_PERMISSION\")"
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "49f0865e48514e3ac0574da4305d5a58",
    "id": null,
    "metadata": {},
    "name": "securityGetBySpecificAttributeQuery",
    "operationKind": "query",
    "text": "query securityGetBySpecificAttributeQuery {\n  roles {\n    role\n    attribute(attribute: MAX_DATASET_PERMISSION) {\n      __typename\n      ...securityAttrFrag\n    }\n  }\n}\n\nfragment securityAttrFrag on UserAttributeInfo {\n  __isUserAttributeInfo: __typename\n  ... on BoolUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    boolValue: value\n    boolOptions: options\n  }\n  ... on DatasetAccessLevelUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    accessLevelValue: value\n    accessLevelOptions: options\n  }\n  ... on DatasetPermissionUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    permissionValue: value\n    permissionOptions: options\n  }\n}\n"
  }
};
})();

(node as any).hash = "ad4d6c6277dbdf306002ebbf561b7ef0";

export default node;
