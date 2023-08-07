import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setViewMutation(
    $subscription: String!
    $session: String
    $view: BSONArray!
    $savedViewSlug: String
    $datasetName: String!
    $form: StateForm!
  ) {
    setView(
      subscription: $subscription
      session: $session
      view: $view
      savedViewSlug: $savedViewSlug
      datasetName: $datasetName
      form: $form
    ) {
      dataset {
        id
        name
        mediaType
        parentMediaType
        groupSlice
        defaultGroupSlice
        groupField
        groupMediaTypes {
          name
          mediaType
        }
        stages(slug: $savedViewSlug)
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
          description
          color
          viewStages
          slug
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
            supportsPrompts
            type
          }
        }
        lastLoadedAt
        createdAt
        version
        viewCls
        viewName
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
          colorScheme {
            colorPool
            fields {
              path
              fieldColor
              colorByAttribute
              valueColors {
                value
                color
              }
            }
          }
        }
      }
      view
    }
  }
`);
