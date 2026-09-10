import { graphql } from "relay-runtime";

export default graphql`
  fragment expressionCatalogFragment on Query {
    viewExpressionAstVersion
    viewExpressionFieldKinds {
      ftype
      kind
    }
    viewExpressionOperators {
      name
      display
      syntax
      selfKind
      argKinds
      returns
      minArgs
      maxArgs
      reflected
      typed
      summary
    }
  }
`;
