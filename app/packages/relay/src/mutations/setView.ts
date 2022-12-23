import { graphql } from "react-relay";

export default graphql`
  mutation setViewMutation(
    $subscription: String!
    $session: String
    $view: BSONArray!
    $viewName: String
    $savedViewSlug: String
    $changingSavedView: Boolean
    $datasetName: String!
    $form: StateForm!
  ) {
    setView(
      subscription: $subscription
      session: $session
      view: $view
      viewName: $viewName
      savedViewSlug: $savedViewSlug
      changingSavedView: $changingSavedView
      datasetName: $datasetName
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
        savedViews {
          id
          name
          slug
          description
          color
          viewStages
          createdAt
          lastModifiedAt
          lastLoadedAt
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
          modalMediaField
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
      viewName
      savedViewSlug
      changingSavedView
    }
  }
`;
