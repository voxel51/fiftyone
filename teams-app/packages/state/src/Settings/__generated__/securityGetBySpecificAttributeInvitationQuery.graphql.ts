/**
 * @generated SignedSource<<22ad9845e65beaf8cbdb1d8bacd8ea93>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type securityGetBySpecificAttributeInvitationQuery$variables = {};
export type securityGetBySpecificAttributeInvitationQuery$data = {
  readonly roles: ReadonlyArray<{
    readonly attribute: {
      readonly " $fragmentSpreads": FragmentRefs<"securityAttrFrag">;
    };
    readonly role: UserRole;
  }>;
};
export type securityGetBySpecificAttributeInvitationQuery = {
  response: securityGetBySpecificAttributeInvitationQuery$data;
  variables: securityGetBySpecificAttributeInvitationQuery$variables;
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
    "value": "MANAGE_INVITATIONS"
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
    "name": "securityGetBySpecificAttributeInvitationQuery",
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
            "storageKey": "attribute(attribute:\"MANAGE_INVITATIONS\")"
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
    "name": "securityGetBySpecificAttributeInvitationQuery",
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
            "storageKey": "attribute(attribute:\"MANAGE_INVITATIONS\")"
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "3b5f08912e29df4a6436bdaee71327c4",
    "id": null,
    "metadata": {},
    "name": "securityGetBySpecificAttributeInvitationQuery",
    "operationKind": "query",
    "text": "query securityGetBySpecificAttributeInvitationQuery {\n  roles {\n    role\n    attribute(attribute: MANAGE_INVITATIONS) {\n      __typename\n      ...securityAttrFrag\n    }\n  }\n}\n\nfragment securityAttrFrag on UserAttributeInfo {\n  __isUserAttributeInfo: __typename\n  ... on BoolUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    boolValue: value\n    boolOptions: options\n  }\n  ... on DatasetAccessLevelUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    accessLevelValue: value\n    accessLevelOptions: options\n  }\n  ... on DatasetPermissionUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    permissionValue: value\n    permissionOptions: options\n  }\n}\n"
  }
};
})();

(node as any).hash = "6e7b634055f50a927c1e1dcec76c3c1c";

export default node;
