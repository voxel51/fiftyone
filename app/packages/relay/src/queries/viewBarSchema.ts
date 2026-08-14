import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query viewBarSchemaQuery($name: String!, $view: BSONArray!) {
    schemaForViewStages(datasetName: $name, viewStages: $view) {
      fieldSchema {
        path
        ftype
        subfield
        embeddedDocType
      }
      frameFieldSchema {
        path
        ftype
        subfield
        embeddedDocType
      }
    }
  }
`);
