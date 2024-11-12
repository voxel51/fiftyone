import { atom } from "recoil";
import { graphql } from "react-relay";

export const showGenerateAPITokenDialog = atom({
  key: "showGenerateAPITokenDialog",
  default: false,
});

export const apiTokensGenerateMutation = graphql`
  mutation apiTokensGenerateMutation($name: String!) {
    generateApiKey(name: $name) {
      createdAt
      id
      key
      name
    }
  }
`;

export const apiTokensDeleteMutation = graphql`
  mutation apiTokensDeleteMutation($keyId: String!) {
    removeApiKey(keyId: $keyId)
  }
`;
