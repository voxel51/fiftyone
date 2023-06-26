import { graphql } from "react-relay";
import r from "../resolve";

// todo add all aggregate response types
export default r(graphql`
  subscription tickSubscription {
    tick
  }
`);
