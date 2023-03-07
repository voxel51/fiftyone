import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetFragment on Query @inline {
    dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {
      stages(slug: $savedViewSlug)
      id
      name
      mediaType
      defaultGroupSlice
      groupField
      groupMediaTypes {
        name
        mediaType
      }
      appConfig {
        gridMediaField
        mediaFields
        modalMediaField
        plugins
        sidebarGroups {
          expanded
          paths
          name
        }
        sidebarMode
      }
      sampleFields {
        ftype
        subfield
        embeddedDocType
        path
        dbField
        description
        info
      }
      frameFields {
        ftype
        subfield
        embeddedDocType
        path
        dbField
        description
        info
      }
      maskTargets {
        name
        targets {
          target
          value
        }
      }
      defaultMaskTargets {
        target
        value
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
        }
      }
      savedViews {
        id
        datasetId
        name
        slug
        description
        color
        viewStages
      }
      lastLoadedAt
      createdAt
      skeletons {
        name
        labels
        edges
      }
      defaultSkeleton {
        labels
        edges
      }
      version
      viewCls
      viewName
      savedViewSlug
      info
    }
  }
`;
