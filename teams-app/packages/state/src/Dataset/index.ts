import { graphql } from "react-relay/hooks";
import { atom, selector } from "recoil";

export interface Dataset {
  id: string;
  name: string;
  slug: string;
  viewer?: {
    pinned;
  };
  samplesCount?: number | null;
  createdAt?: string;
  createdBy?: {
    id: string;
    name: string;
  };
  description?: string;
  mediaType?: "image" | "video";
  sampleFieldsCount?: number;
  lastLoadedAt?: number;
  tags?: string[] | null;
}

export const DatasetFragment = graphql`
  fragment DatasetFrag on Dataset {
    id
    name
    slug
    mediaType
    createdAt
    lastLoadedAt
    defaultPermission
    samplesCount
    sampleFieldsCount
    tags
    viewer {
      user {
        id
        email
      }
      pinned
      pinnedAt
      activePermission
    }
  }
`;

// TODO: use fragments for all of these queries if possible
export const datasetBySlugQuery = graphql`
  query DatasetBySlugQuery($identifier: String!) {
    dataset(identifier: $identifier) {
      id
      name
      description
      lastLoadedAt
      viewer {
        pinned
        permission
        activePermission
        userPermission
      }
      samplesCount
      sampleFieldsCount
      tags
      mediaType
      createdAt
      slug
      createdBy {
        id
        name
      }
    }
  }
`;

export const DatasetSlugQuery = graphql`
  query DatasetSlugQuery($name: String!, $skip: Boolean!) {
    datasetSlug(name: $name) @skip(if: $skip) {
      slug
      available
    }
  }
`;

export const DatasetShareInfoQuery = graphql`
  query DatasetShareInfoQuery($identifier: String!, $usersLimit: Int!) {
    dataset(identifier: $identifier) {
      defaultPermission
      usersCount
      usersWithSpecialAccessCount: usersCount(
        filter: { userPermission: { ne: null } }
      )
      guestCount: usersCount(filter: { userRole: { eq: GUEST } })
      collaboratorCount: usersCount(filter: { userRole: { eq: COLLABORATOR } })
      users(first: $usersLimit) {
        user {
          id
          name
          picture
        }
      }
    }
  }
`;

export const DatasetCloneMutation = graphql`
  mutation DatasetCloneMutation(
    $name: String!
    $sourceIdentifier: String!
    $snapshot: String
  ) {
    cloneDataset(
      name: $name
      sourceIdentifier: $sourceIdentifier
      snapshot: $snapshot
    ) {
      ...DatasetFrag @relay(mask: false)
    }
  }
`;

export const DatasetCreateDatasetMutation = graphql`
  mutation DatasetCreateDatasetMutation(
    $name: String!
    $description: String
    $tags: [String!]
  ) {
    createDataset(name: $name, description: $description, tags: $tags) {
      id
      name
      slug
    }
  }
`;

export const DatasetUpdateMutation = graphql`
  mutation DatasetUpdateMutation(
    $identifier: String!
    $name: String!
    $description: String
    $tags: [String!]
  ) {
    updateDataset(
      identifier: $identifier
      name: $name
      description: $description
      tags: $tags
    ) {
      id
      name
      slug
      description
      tags
    }
  }
`;

export { DatasetCloneViewMutation as DatasetCloneViewMutationType } from "./__generated__/DatasetCloneViewMutation.graphql";
export const DatasetCloneViewMutation = graphql`
  mutation DatasetCloneViewMutation(
    $sourceIdentifier: String!
    $sourceView: ViewSelectors!
    $name: String!
    $snapshot: String = null
  ) {
    createDatasetFromView(
      sourceIdentifier: $sourceIdentifier
      sourceView: $sourceView
      name: $name
      snapshot: $snapshot
    ) {
      slug
    }
  }
`;

export const DatasetExportFormatsQuery = graphql`
  query DatasetExportFormatsQuery(
    $datasetIdentifier: String!
    $includeMedia: Boolean!
  ) {
    dataset(identifier: $datasetIdentifier) {
      exportFormats(includeMedia: $includeMedia) {
        displayName
        name
        datasetType
        frameLabelTypes
        labelTypes
        mediaTypes
        allowMultiFieldSelect
      }
    }
  }
`;

export const DatasetExportFieldsQuery = graphql`
  query DatasetExportFieldsQuery(
    $datasetIdentifier: String!
    $exportFormat: String!
  ) {
    dataset(identifier: $datasetIdentifier) {
      exportFields(exportFormat: $exportFormat)
    }
  }
`;

export const DatasetExportEstimateQuery = graphql`
  query DatasetExportEstimateQuery(
    $datasetIdentifier: String!
    $viewSelectors: ViewSelectors!
    $fields: [String!]
    $includeMedia: Boolean
  ) {
    dataset(identifier: $datasetIdentifier) {
      sizeEstimate(
        viewSelectors: $viewSelectors
        fields: $fields
        includeMedia: $includeMedia
      )
    }
  }
`;

export const DatasetSnapshotExportFormatsQuery = graphql`
  query DatasetSnapshotExportFormatsQuery(
    $datasetIdentifier: String!
    $includeMedia: Boolean!
    $snapshot: String!
  ) {
    dataset(identifier: $datasetIdentifier) {
      snapshot(snapshot: $snapshot) {
        exportFormats(includeMedia: $includeMedia) {
          displayName
          name
          datasetType
          frameLabelTypes
          labelTypes
          mediaTypes
          allowMultiFieldSelect
        }
        # todo: need to find a way to avoid re-fetching
        name
        id
        createdBy {
          name
          picture
        }
        createdAt
      }
    }
  }
`;

export const DatasetSnapshotExportFieldsQuery = graphql`
  query DatasetSnapshotExportFieldsQuery(
    $datasetIdentifier: String!
    $exportFormat: String!
    $snapshot: String!
  ) {
    dataset(identifier: $datasetIdentifier) {
      snapshot(snapshot: $snapshot) {
        exportFields(exportFormat: $exportFormat)
        # todo: need to find a way to avoid re-fetching
        name
        id
        createdBy {
          name
          picture
        }
        createdAt
      }
    }
  }
`;

export const DatasetSnapshotExportEstimateQuery = graphql`
  query DatasetSnapshotExportEstimateQuery(
    $datasetIdentifier: String!
    $viewSelectors: ViewSelectors!
    $fields: [String!]
    $includeMedia: Boolean
    $snapshot: String!
  ) {
    dataset(identifier: $datasetIdentifier) {
      snapshot(snapshot: $snapshot) {
        sizeEstimate(
          viewSelectors: $viewSelectors
          fields: $fields
          includeMedia: $includeMedia
        )
        # todo: need to find a way to avoid re-fetching
        name
        id
        createdBy {
          name
          picture
        }
        createdAt
      }
    }
  }
`;

export const DatasetExportMutation = graphql`
  mutation DatasetExportMutation(
    $datasetIdentifier: String!
    $exportViewSelectors: ViewSelectors!
    $includeFilepaths: Boolean!
    $includeTags: Boolean!
    $includeMedia: Boolean!
    $includeLabels: LabelFormatOptions
    $cloudStoragePath: String = null
    $snapshot: String = null
  ) {
    exportView(
      datasetIdentifier: $datasetIdentifier
      exportViewSelectors: $exportViewSelectors
      includeFilepaths: $includeFilepaths
      includeTags: $includeTags
      includeMedia: $includeMedia
      includeLabels: $includeLabels
      cloudStoragePath: $cloudStoragePath
      snapshot: $snapshot
    )
  }
`;

export const shareDatasetOpen = atom({
  key: "shareDatasetOpen",
  default: false,
});

/* 
current view: view
dataset: entire dataset with runs and saved views,
view-no-filter: entire dataset w/t runs and saved views. 
Naming the third one with view becuase we call view.clone()
*/
export const cloneType = atom<"view" | "dataset" | "view-no-filter">({
  key: "cloneType",
  default: "view",
});

export const exportType = atom<"view" | "dataset">({
  key: "exportType",
  default: "view",
});

type FormState = {
  view: string;
  data?: string;
  format?: string;
  field?: string;
  fieldsAvailable?: Array<string>;
  size?: number;
  token?: string;
  path?: string;
};

export const exportSelectionDefault = selector<FormState>({
  key: "exportSelectionDefault",
  get: ({ get }) => {
    const currentExportType = get(exportType);
    return {
      view: currentExportType,
    };
  },
});

export const exportSelection = atom<FormState>({
  key: "exportSelection",
  default: {
    view: "view",
  },
});

export const cloneViewForceClosePopoverCount = atom({
  key: "cloneViewForceClosePopoverCount",
  default: 0,
});

export const exportViewForceClosePopoverCount = atom({
  key: "exportViewForceClosePopoverCount",
  default: 0,
});

export const exportMode = atom({
  key: "exportMode",
  default: "direct",
});

export const pendingDatasetRefresh = atom({
  key: "pendingDatasetRefresh",
  default: false,
});

export const showReadonlyDatasetIndicator = atom({
  key: "showReadonlyDatasetIndicator",
  default: false,
});
