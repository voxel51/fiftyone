import { graphql } from "react-relay";
import { atom } from "recoil";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "../constants";

/**
 * Recoil
 */

export const cloneSnapshotState = atom<{
  open: boolean;
  id?: string;
  name?: string;
}>({
  key: "cloneSnapshotState",
  default: { open: false },
});

export const deleteSnapshotState = atom<{
  open: boolean;
  id?: string;
  name?: string;
}>({
  key: "deleteSnapshotState",
  default: { open: false },
});

export const openSnapshotLocallyState = atom<{
  open: boolean;
  id?: string;
  name?: string;
}>({
  key: "openSnapshotLocallyState",
  default: { open: false },
});

export const rollbackSnapshotState = atom<{
  open: boolean;
  id?: string;
  name?: string;
  author?: string;
  since?: number;
}>({
  key: "rollbackSnapshotState",
  default: { open: false },
});

export const snapshotsPageState = atom({
  key: "snapshotsPageState",
  default: {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  },
});

/**
 * Relay Queries
 */
export const historySnapshotsQuery = graphql`
  query historySnapshotsQuery($slug: String!, $pageSize: Int!, $page: Int!) {
    dataset(identifier: $slug) {
      latestChanges {
        numSamplesAdded
        numSamplesChanged
        numSamplesDeleted
        totalSamples
        updatedAt
      }
      snapshotsPage(
        pageSize: $pageSize
        page: $page
        order: { field: createdAt, direction: DESC }
      ) {
        pageTotal
        nodes {
          id
          description
          name
          slug
          createdAt
          createdBy {
            picture
            name
          }
          linearChangeSummary {
            numSamplesAdded
            numSamplesChanged
            numSamplesDeleted
            totalSamples
          }
          loadStatus
        }
      }
    }
  }
`;

export const historySnapshotQuery = graphql`
  query historySnapshotQuery($dataset: String!, $snapshot: String!) {
    dataset(identifier: $dataset) {
      snapshot(snapshot: $snapshot) {
        name
        id
        createdBy {
          name
          picture
        }
        createdAt
        loadStatus
      }
    }
  }
`;

export const historySnapshotsConnectionQuery = graphql`
  query historySnapshotsConnectionQuery($identifier: String!, $first: Int!) {
    dataset(identifier: $identifier) {
      snapshots(first: $first, order: { field: createdAt, direction: DESC }) {
        createdAt
        createdBy {
          name
          picture
        }
        description
        id
        name
        linearChangeSummary {
          numSamplesAdded
          numSamplesChanged
          numSamplesDeleted
          totalSamples
        }
        loadStatus
      }
    }
  }
`;

/**
 * Relay Mutations
 */

export const historyCreateSnapshotMutation = graphql`
  mutation historyCreateSnapshotMutation(
    $datasetIdentifier: String!
    $snapshotName: String!
    $description: String
  ) {
    createDatasetSnapshot(
      datasetIdentifier: $datasetIdentifier
      snapshotName: $snapshotName
      description: $description
    ) {
      id
    }
  }
`;

export const historyDeleteSnapshotMutation = graphql`
  mutation historyDeleteSnapshotMutation(
    $datasetIdentifier: String!
    $snapshotName: String!
  ) {
    deleteDatasetSnapshot(
      datasetIdentifier: $datasetIdentifier
      snapshotName: $snapshotName
    )
  }
`;

export const historyLoadDatasetSnapshotMutation = graphql`
  mutation historyLoadDatasetSnapshotMutation(
    $datasetIdentifier: String!
    $snapshotName: String!
  ) {
    loadDatasetSnapshot(
      datasetIdentifier: $datasetIdentifier
      snapshotName: $snapshotName
    )
  }
`;

export const historyRevertDatasetToSnapshotMutation = graphql`
  mutation historyRevertDatasetToSnapshotMutation(
    $datasetIdentifier: String!
    $snapshotName: String!
  ) {
    revertDatasetToSnapshot(
      datasetIdentifier: $datasetIdentifier
      snapshotName: $snapshotName
    ) {
      id
    }
  }
`;

export const historyCalculateDatasetLatestChangesMutation = graphql`
  mutation historyCalculateDatasetLatestChangesMutation(
    $datasetIdentifier: String!
  ) {
    calculateDatasetLatestChanges(datasetIdentifier: $datasetIdentifier) {
      numSamplesAdded
      numSamplesChanged
      numSamplesDeleted
      totalSamples
    }
  }
`;

export const historyOffloadDatasetSnapshotMutation = graphql`
  mutation historyOffloadDatasetSnapshotMutation(
    $datasetIdentifier: String!
    $snapshotName: String!
  ) {
    offloadDatasetSnapshot(
      datasetIdentifier: $datasetIdentifier
      snapshotName: $snapshotName
    )
  }
`;
