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
    )
  }
`);
