/**
 * @generated SignedSource<<a4cb1560c41ad3f8283cfc3c0029295f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type teamRevokeInvitationMutation$variables = {
  invitationId: string;
};
export type teamRevokeInvitationMutation$data = {
  readonly revokeUserInvitation: any | null;
};
export type teamRevokeInvitationMutation = {
  response: teamRevokeInvitationMutation$data;
  variables: teamRevokeInvitationMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "invitationId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "invitationId",
        "variableName": "invitationId"
      }
    ],
    "kind": "ScalarField",
    "name": "revokeUserInvitation",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "teamRevokeInvitationMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "teamRevokeInvitationMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "266a620a9edfeabd22622370707bfc84",
    "id": null,
    "metadata": {},
    "name": "teamRevokeInvitationMutation",
    "operationKind": "mutation",
    "text": "mutation teamRevokeInvitationMutation(\n  $invitationId: String!\n) {\n  revokeUserInvitation(invitationId: $invitationId)\n}\n"
  }
};
})();

(node as any).hash = "254d06b334752ddc67ba2265ad211a6f";

export default node;
