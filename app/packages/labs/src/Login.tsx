import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { graphql } from "relay-runtime";

import Loading from "@fiftyone/app/src/components/Loading";

import routes from "./routing/routes";
import RoutingContext, { createRouter } from "./routing/RoutingContext";
import RouterRenderer from "./routing/RouteRenderer";
import useMutation from "./useMutation";

const Router = () => {
  const [router] = useState(() => createRouter(routes));
  const auth0 = useAuth0();

  return (
    <RoutingContext.Provider value={router.context}>
      <RouterRenderer />
    </RoutingContext.Provider>
  );
};

const LoginMutation = graphql`
  mutation LoginMutation($input: UserInput!) {
    login(input: $input) {
      viewer {
        id
      }
    }
  }
`;

const Login = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [pending, logIn] = useMutation(LoginMutation);
  const auth0 = useAuth0();

  useEffect(() => {
    console.log(auth0.user);
    return;
    /*!loggedIn && !pending && logIn({
        variables: {
            email: 
        }
    })*/
  }, [loggedIn, pending]);

  if (!loggedIn) {
    return <Loading text={"Pixelating..."} />;
  }

  return <Router />;
};

export default Login;
