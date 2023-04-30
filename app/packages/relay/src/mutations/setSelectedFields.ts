import { graphql } from "react-relay";

export default graphql`
  mutation setSelectedFieldsMutation(
    $subscription: String!
    $form: StateForm = null
  ) {
    setSelectedFields(subscription: $subscription, form: $form)
  }
`;
