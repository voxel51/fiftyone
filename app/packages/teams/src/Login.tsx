import { useAuth0 } from "@auth0/auth0-react";
import React, { Suspense, useEffect, useState, useContext } from "react";
import { graphql } from "relay-runtime";

import { Loading, RouterContext } from "@fiftyone/components";

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
  const { history } = useContext(RouterContext);

  useEffect(() => {
    if (!user || loggedIn || pending) {
      return;
    }

    logIn({
      onCompleted: (_, errors) => {
        if (!errors) {
          setLoggedIn(true);

          let params = new URLSearchParams(location.search);
          const paramsToRemove = ["code", "state"];
          let paramsChanged = false;
          for (const param of paramsToRemove) {
            if (params.has(param)) {
              params.delete(param);
              paramsChanged = true;
            }
          }
          if (paramsChanged) {
            let newPath = window.location.pathname;
            if (Array.from(params).length > 0) {
              newPath += "?" + params;
            }
            newPath += location.hash;
            history.replace(newPath);
          }
        }
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
