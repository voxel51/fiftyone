import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetFragment on Dataset {
    createdAt
    datasetId
    groupField
    id
    info
    lastLoadedAt
    mediaType
    name
    version
    appConfig {
      ...datasetAppConfigFragment
    }
    brainMethods {
      key
      version
      timestamp
      viewStages
      config {
        cls
        embeddingsField
        method
        patchesField
        supportsPrompts
        type
        maxK
        supportsLeastSimilarity
      }
    }
    defaultMaskTargets {
      target
      value
    }
    defaultSkeleton {
      labels
      edges
    }
    evaluations {
      key
      version
      timestamp
      viewStages
      config {
        cls
        predField
        gtField
      }
    }
    groupMediaTypes {
      name
      mediaType
    }
    maskTargets {
      name
      targets {
        target
        value
      }
    }
    skeletons {
      name
      labels
      edges
    }

    ...frameFieldsFragment
    ...groupSliceFragment
    ...mediaFieldsFragment
    ...mediaTypeFragment
    ...sampleFieldsFragment
    ...sidebarGroupsFragment
    ...viewFragment
  }
`;
