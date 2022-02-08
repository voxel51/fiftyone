import { useAuth0 } from "@auth0/auth0-react";
import React, { useEffect, useState } from "react";
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
  mutation LoginMutation($user: UserInput!) {
    login(user: $user) {
      id
      familyName
    }
  }
`;

const Login = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [pending, logIn] = useMutation(LoginMutation);
  const { user } = useAuth0();

  useEffect(() => {
    if (!user || loggedIn || pending) {
      return;
    }

    logIn({
      onCompleted: (response, errors) => {
        !errors && setLoggedIn(true);
      },
      variables: {
        user: {
          email: user.email,
          familyName: user.family_name,
          givenName: user.given_name,
          sub: user.sub,
        },
      },
    });
  }, [loggedIn, pending]);

  if (!loggedIn) {
    return <Loading text={"Pixelating..."} />;
  }

  return <Router />;
};

export default Login;
