import { getSessionEndpoint } from "@fiftyone/teams-utilities";
import React from "react";
import { getRelaySerializedState } from "relay-nextjs";
import { withHydrateDatetime } from "relay-nextjs/date";
import {
  Environment,
  IEnvironment,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";
import { SIGN_IN_ENDPOINT_WITH_ERROR_PREFIX } from "./constants";

export const TeamsRelayEnvironment = React.createContext<
  IEnvironment | undefined
>(undefined);

export const OSSRelayEnvironment = React.createContext<Environment | undefined>(
  undefined
);

function triggerSignIn(errMsg?: string) {
  location.href = errMsg
    ? SIGN_IN_ENDPOINT_WITH_ERROR_PREFIX + errMsg
    : getSessionEndpoint(location.href);
}

export function createClientNetwork() {
  return Network.create(async (params, variables) => {
    const response = await fetch("/api/proxy/graphql-v1", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: params.text,
        variables,
      }),
    });

    let jsonResponse;
    const apiResponse = await response.text();
    if (apiResponse) {
      try {
        jsonResponse = JSON.parse(apiResponse, withHydrateDatetime);
      } catch (e) {
        console.debug("Error parsing graphql response from api", e);
      }
    }

    if (response.status === 401 || response.status === 403) {
      console.debug("Unauthorized api request", jsonResponse || apiResponse);
      const errMsg = jsonResponse?.error || "UserComplianceError";
      return triggerSignIn(errMsg);
    }

    if (response.status === 200) {
      // return a valid json response
      return jsonResponse || {};
    }

    return triggerSignIn();
  });
}

let teamsClientEnv: Environment | null = null;
export function getTeamsClientEnvironment(): Environment {
  if (typeof window !== "undefined" && teamsClientEnv === null) {
    teamsClientEnv = new Environment({
      network: createClientNetwork(),
      store: new Store(new RecordSource(getRelaySerializedState()?.records)),
      isServer: false,
    });
  }

  return teamsClientEnv;
}
