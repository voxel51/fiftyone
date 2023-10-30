import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment viewSchemaFragment on Query {
    schemaForViewStages(datasetName: $name, viewStages: $view) {
      fieldSchema {
        path
        ftype
        subfield
        embeddedDocType
        info
        description
        subfield
      }
      frameFieldSchema {
        path
        ftype
        subfield
        embeddedDocType
        info
        description
        subfield
      }
    }
  }
`);
