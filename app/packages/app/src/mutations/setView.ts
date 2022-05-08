import { graphql } from "relay-runtime";

export default graphql`
  mutation setViewMutation(
    $subscription: String!
    $session: String
    $view: JSONArray!
  ) {
    setView(subscription: $subscription, session: $session, view: $view) {
      dataset {
        id
        name
        mediaType
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
        appSidebarGroups {
          name
          paths
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
      }
      view
    }
  }
`;
