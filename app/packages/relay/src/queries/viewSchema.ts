import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment viewSchemaFragment on Query
  @refetchable(queryName: "viewSchemaFragmentQuery") {
    schemaForViewStages(datasetName: $name, viewStages: $viewStages) {
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
