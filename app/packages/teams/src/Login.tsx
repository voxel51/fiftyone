import { useAuth0 } from "@auth0/auth0-react";
import React, { Suspense, useEffect, useState } from "react";
import { graphql } from "relay-runtime";

import { Loading } from "@fiftyone/components";

import { NetworkRenderer } from "@fiftyone/app/src/Network";
import makeRoutes from "@fiftyone/app/src/makeRoutes";
import { useMutation } from "react-relay";

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
  const [logIn, pending] = useMutation(LoginMutation);
  const { user } = useAuth0();

  useEffect(() => {
    if (!user || loggedIn || pending) {
      return;
    }

    logIn({
      onCompleted: (_, errors) => {
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
      <NetworkRenderer makeRoutes={makeRoutes} />
    </Suspense>
  );
};

export default Login;
