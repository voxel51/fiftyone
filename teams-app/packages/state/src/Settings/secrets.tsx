import { atom } from 'recoil';
import { graphql } from 'react-relay';

export const showCreateSecretDialog = atom({
  key: 'showCreateSecretDialog',
  default: false
});
export const secretsUploadedQuery = graphql`
  query secretsUploadedQuery {
    secrets {
      secretKey: key
      description
      createdAt  
    }
  }
`;
export const secretsCreateMutation = graphql`
  mutation secretsCreateMutation($key: String!, $value: String!, $description: String, $scope: SecretScope = GLOBAL, $metadata: JSON) {
    createSecret(key: $key, value: $value, description: $description, scope: $scope, metadata: $metadata ){
      secretKey: key
      createdAt
      description
    }
  }
`;

export const secretsDeleteMutation = graphql`
  mutation secretsDeleteMutation($key: String!) {
    deleteSecret(key: $key)
  }
`;

export const secretsUpdateMutation = graphql`
  mutation secretsUpdateMutation($key: String!, $description: String, $scope: SecretScope, $metadata: JSON) {
    updateSecret(key: $key, description: $description, scope: $scope, metadata: $metadata ){
      secretKey: key
      createdAt
      description
    }
  }
`;
