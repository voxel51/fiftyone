/**
 * @generated SignedSource<<88de927b54bcc80c7409f0b84c31afea>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type manageDatasetGetAccessPageQuery$variables = {
  datasetIdentifier: string;
  page: number;
  pageSize: number;
};
export type manageDatasetGetAccessPageQuery$data = {
  readonly dataset: {
    readonly accessPage: {
      readonly next: number | null;
      readonly nodeTotal: number;
      readonly nodes: ReadonlyArray<{
        readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_accessFrag">;
      }>;
      readonly page: number | null;
      readonly pageSize: number;
      readonly pageTotal: number;
      readonly prev: number | null;
    };
    readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_datasetFrag">;
  } | null;
};
export type manageDatasetGetAccessPageQuery = {
  response: manageDatasetGetAccessPageQuery$data;
  variables: manageDatasetGetAccessPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetIdentifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "page"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pageSize"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "identifier",
    "variableName": "datasetIdentifier"
  }
],
v2 = [
  {
    "kind": "Variable",
    "name": "page",
    "variableName": "page"
  },
  {
    "kind": "Variable",
    "name": "pageSize",
    "variableName": "pageSize"
  },
  {
    "kind": "Literal",
    "name": "userFilter",
    "value": {
      "userPermission": {
        "ne": null
      }
    }
  }
],
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "nodeTotal",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "next",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "page",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "pageSize",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "pageTotal",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "prev",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "attribute",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "display",
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "manageDatasetGetAccessPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "manageDatasetGetAccessPage_datasetFrag"
          },
          {
            "alias": null,
            "args": (v2/*: any*/),
            "concreteType": "DatasetAccessPage",
            "kind": "LinkedField",
            "name": "accessPage",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": null,
                "kind": "LinkedField",
                "name": "nodes",
                "plural": true,
                "selections": [
                  {
                    "args": null,
                    "kind": "FragmentSpread",
                    "name": "manageDatasetGetAccessPage_accessFrag"
                  }
                ],
                "storageKey": null
              },
              (v3/*: any*/),
              (v4/*: any*/),
              (v5/*: any*/),
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/)
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetGetAccessPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v9/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "defaultPermission",
            "storageKey": null
          },
          {
            "alias": null,
            "args": (v2/*: any*/),
            "concreteType": "DatasetAccessPage",
            "kind": "LinkedField",
            "name": "accessPage",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": null,
                "kind": "LinkedField",
                "name": "nodes",
                "plural": true,
                "selections": [
                  (v10/*: any*/),
                  {
                    "kind": "TypeDiscriminator",
                    "abstractKey": "__isDatasetAccess"
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      {
                        "alias": "userId",
                        "args": null,
                        "kind": "ScalarField",
                        "name": "id",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "email",
                        "storageKey": null
                      },
                      (v11/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "role",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "picture",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "userPermission",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "activePermission",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": null,
                        "kind": "LinkedField",
                        "name": "attributes",
                        "plural": true,
                        "selections": [
                          (v10/*: any*/),
                          {
                            "kind": "TypeDiscriminator",
                            "abstractKey": "__isUserAttributeInfo"
                          },
                          {
                            "kind": "InlineFragment",
                            "selections": [
                              (v12/*: any*/),
                              (v13/*: any*/),
                              (v14/*: any*/),
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
                              (v12/*: any*/),
                              (v13/*: any*/),
                              (v14/*: any*/),
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
                              (v12/*: any*/),
                              (v13/*: any*/),
                              (v14/*: any*/),
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
                    "type": "DatasetUser",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      {
                        "alias": "groupId",
                        "args": null,
                        "kind": "ScalarField",
                        "name": "id",
                        "storageKey": null
                      },
                      (v11/*: any*/),
                      (v9/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "permission",
                        "storageKey": null
                      },
                      (v14/*: any*/)
                    ],
                    "type": "DatasetUserGroup",
                    "abstractKey": null
                  }
                ],
                "storageKey": null
              },
              (v3/*: any*/),
              (v4/*: any*/),
              (v5/*: any*/),
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "1bc0e580d233f8484e4a7732d9897cae",
    "id": null,
    "metadata": {},
    "name": "manageDatasetGetAccessPageQuery",
    "operationKind": "query",
    "text": "query manageDatasetGetAccessPageQuery(\n  $datasetIdentifier: String!\n  $page: Int!\n  $pageSize: Int!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    ...manageDatasetGetAccessPage_datasetFrag\n    accessPage(userFilter: {userPermission: {ne: null}}, page: $page, pageSize: $pageSize) {\n      nodes {\n        __typename\n        ...manageDatasetGetAccessPage_accessFrag\n      }\n      nodeTotal\n      next\n      page\n      pageSize\n      pageTotal\n      prev\n    }\n  }\n}\n\nfragment UserAttrFrag on UserAttributeInfo {\n  __isUserAttributeInfo: __typename\n  ... on BoolUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    boolValue: value\n    boolOptions: options\n  }\n  ... on DatasetAccessLevelUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    accessLevelValue: value\n    accessLevelOptions: options\n  }\n  ... on DatasetPermissionUserAttributeInfo {\n    attribute\n    display\n    description\n    __typename\n    permissionValue: value\n    permissionOptions: options\n  }\n}\n\nfragment manageDatasetGetAccessPage_accessFrag on DatasetAccess {\n  __isDatasetAccess: __typename\n  __typename\n  ... on DatasetUser {\n    ...manageDatasetGetAccessPage_userFrag\n  }\n  ... on DatasetUserGroup {\n    ...manageDatasetGetAccessPage_groupFrag\n  }\n}\n\nfragment manageDatasetGetAccessPage_datasetFrag on Dataset {\n  slug\n  defaultPermission\n}\n\nfragment manageDatasetGetAccessPage_groupFrag on DatasetUserGroup {\n  groupId: id\n  name\n  slug\n  permission\n  description\n}\n\nfragment manageDatasetGetAccessPage_userFrag on DatasetUser {\n  userId: id\n  email\n  name\n  role\n  picture\n  userPermission\n  activePermission\n  attributes {\n    __typename\n    ...UserAttrFrag\n  }\n}\n"
  }
};
})();

(node as any).hash = "8294f3e7b63e1b6e626d5ab39213e0eb";

export default node;
