import { graphql } from "react-relay";
import { atom } from "recoil";
import { cloudStorageCredentialsQuery$dataT } from "./__generated__";

export const addCredentialAtom = atom<{
  provider: "AWS" | "GCP" | "MINIO" | "AZURE";
  open: boolean;
}>({
  key: "addCredentialAtom",
  default: {
    provider: "GCP",
    open: false,
  },
});

export const deleteCredentialAtom = atom<{
  provider: "AWS" | "GCP" | "MINIO" | "AZURE";
  open: boolean;
  prefixes?: string[] | readonly string[];
}>({
  key: "deleteCredentialAtom",
  default: {
    provider: "GCP",
    open: false,
  },
});

export const manageCloudStorageAtom = atom<{
  provider: "AWS" | "GCP" | "MINIO" | "AZURE";
  open: boolean;
  credentials: cloudStorageCredentialsQuery$dataT["cloudCredentials"];
}>({
  key: "manageCloudStorageState",
  default: {
    provider: "GCP",
    open: false,
    credentials: [],
  },
});

export const cloudStorageCredentialsQuery = graphql`
  query cloudStorageCredentialsQuery {
    cloudCredentials {
      createdAt
      description
      prefixes
      provider
    }
  }
`;

export const cloudStorageSetCredentialMutation = graphql`
  mutation cloudStorageSetCredentialMutation(
    $credentials: String!
    $provider: CloudProvider!
    $prefixes: [String!]
    $description: String
  ) {
    setCloudCredentials(
      credentials: $credentials
      provider: $provider
      prefixes: $prefixes
      description: $description
    ) {
      provider
    }
  }
`;

export const cloudStorageRemoveCredentialMutation = graphql`
  mutation cloudStorageRemoveCredentialMutation(
    $provider: CloudProvider!
    $prefixes: [String!]
  ) {
    removeCloudCredentials(provider: $provider, prefixes: $prefixes)
  }
`;
