import { useAuth0 } from "@auth0/auth0-react";
import React, { Suspense, useEffect, useState } from "react";
import { graphql } from "relay-runtime";

import { Loading, useRouter } from "@fiftyone/components";

import useMutation from "./useMutation";
import Network from "@fiftyone/app/src/Network";
import makeRoutes from "./makeRoutes";

const LoginMutation = graphql`
  mutation LoginMutation($user: UserInput!) {
    login(user: $user) {
      id
      familyName
    }
  }
`;

const Renderer = () => {
  const { context, environment } = useRouter(
    (environment) =>
      makeRoutes(environment, {
        view: () => [],
      }),
    []
  );

  return <Network environment={environment} context={context} />;
};

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
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <Renderer />
    </Suspense>
  );
};

export default Login;
