import { graphql } from "react-relay";

export default graphql`
  mutation setViewMutation(
    $subscription: String!
    $session: String
    $view: BSONArray!
    $dataset: String!
    $form: StateForm!
  ) {
    setView(
      subscription: $subscription
      session: $session
      view: $view
      dataset: $dataset
      form: $form
    ) {
      dataset {
        id
        name
        mediaType
        groupSlice
        defaultGroupSlice
        groupField
        groupMediaTypes {
          name
          mediaType
        }
        sampleFields {
          ftype
          subfield
          embeddedDocType
          path
          dbField
        }
        frameFields {
          ftype
          subfield
          embeddedDocType
          path
          dbField
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
        lastLoadedAt
        createdAt
        version
        viewCls
        skeletons {
          name
          labels
          edges
        }
        defaultSkeleton {
          labels
          edges
        }
        appConfig {
          gridMediaField
          mediaFields
          plugins
          sidebarGroups {
            expanded
            name
            paths
          }
          sidebarMode
        }
      }
      view
    }
  }
`;
