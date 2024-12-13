import { getTeamsClientEnvironment } from "@fiftyone/teams-state";
import {
  getSessionCookieName,
  getType,
  OBJECT_VALUE_TYPE,
} from "@fiftyone/teams-utilities";
import { IncomingMessage } from "http";
import { getEnv } from "lib/env";
import { NextPageContext } from "next";
import { ComponentType, ReactNode } from "react";
import { PreloadedQuery } from "react-relay";
import { withRelay as withNextJSRelay } from "relay-nextjs";
import { WiredProps } from "relay-nextjs/wired/component";
import { GraphQLTaggedNode, OperationType, VariablesOf } from "relay-runtime";
import getTokenFromReq from "./getTokenFromReq";
import { normalizeQueryParams } from "./urlSync";
import withQueryRefresher, { QueryRefresherType } from "./withQueryRefresher";
import cookie from "cookie";
import { SIGN_IN_ENDPOINT_WITH_ERROR_PREFIX } from "@fiftyone/teams-state/src/constants";

type WithRelayOptionsServerSideProps = {
  token: string;
  onUnauthenticated: (status?: number, msg?: string) => void;
  envs?: object;
  onRedirect?: (status?: number, msg?: string) => void;
};

type CreateServerSideEnvironmentProps = {
  onUnauthenticated?: (status?: number, msg?: string) => void;
  onRedirect?: (status?: number, msg?: string) => void;
};

const withRelay = <P extends {} = {}, Q extends OperationType = OperationType>(
  component: ComponentType<RelayProps<P, Q>>,
  query: GraphQLTaggedNode,
  { fallback, serverSideProps, ...otherOptions }: WithRelayOptions,
  variables: RelayProps<P, Q>["preloadedQuery"]["variables"]
) => {
  const ComponentWithQuery = withNextJSRelay<
    RelayProps<P, Q>,
    {
      envs?: object;
      onRedirect?: (status?: number, msg?: string) => void;
      onUnauthenticated?: (status?: number, msg?: string) => void;
    }
  >(withQueryRefresher<RelayProps<P, Q>>(component, query), query, {
    variablesFromContext(ctx) {
      // combine provided variable with route variable
      const { query = {} } = ctx || {};
      const normalizedQuery: Partial<VariablesOf<Q>> = normalizeQueryParams(
        query,
        ctx.pathname,
        ctx.asPath
      );

      return {
        ...variables,
        ...normalizedQuery,
      };
    },
    fallback,
    createClientEnvironment: getTeamsClientEnvironment,
    serverSideProps: async (ctx) => {
      const { err, res, req, asPath } = ctx;
      if (err) {
        console.debug(err);
      }

      /**
       * using getServerSideProps with nextjs fires up a GET RESOURCE.json
       * request in addition to the core graphql POST request on page load.
       */
      if (asPath?.includes(".json")) {
        return res?.writeHead(200).end();
      }

      let serverSidePropsForPage =
        typeof serverSideProps === "function" && (await serverSideProps(ctx));
      if (getType(serverSidePropsForPage) !== OBJECT_VALUE_TYPE)
        serverSidePropsForPage = {};

      const onRedirect = () => {
        res?.writeHead(301, { Location: asPath });
        res?.end();
        return;
      };

      const onUnauthenticated = (status?: number, msg?: string) => {
        if (!res) return;
        if (req?.headers.cookie) {
          console.error("on unauthenticated, clearing cookie");
          console.error("status", status);
          console.error("msg", msg);
          const authCookieName = getSessionCookieName();
          const cookieStr = cookie.serialize(authCookieName, "", {
            path: "/",
            expires: new Date(0), // Set the cookie to expire in the past,
            sameSite: "lax",
            httpOnly: true,
            secure: process.env.CAS_SECURE_COOKIE !== "false",
          });

          res.setHeader("Set-Cookie", cookieStr);
        }
        const signinError =
          status === 403 ? "UserComplianceError" : msg || "Unauthorized";
        res.statusCode = status || 401;
        return res
          ?.writeHead(302, {
            Location: SIGN_IN_ENDPOINT_WITH_ERROR_PREFIX + signinError,
          })
          .end();
      };

      // for media service-worker
      const token = getTokenFromReq(req as IncomingMessage);
      return {
        token,
        onUnauthenticated,
        ...getEnv(),
        ...serverSidePropsForPage,
        onRedirect,
      } as WithRelayOptionsServerSideProps;
    },
    createServerEnvironment: async (
      ctx,
      createServerEnvironmentProps: CreateServerSideEnvironmentProps
    ) => {
      const { createServerEnvironment } = await import("./serverEnvironment");
      const { onUnauthenticated, onRedirect } = createServerEnvironmentProps;

      return createServerEnvironment(
        ctx.req?.headers.cookie as string,
        onUnauthenticated,
        onRedirect
      );
    },
  });

  for (const option in otherOptions) {
    ComponentWithQuery[option] = otherOptions[option];
  }

  return ComponentWithQuery;
};

export default withRelay;

export type RelayProps<
  P extends {} = {},
  Q extends OperationType = OperationType
> = WiredProps<P, Q> & {
  refresh: QueryRefresherType;
};

export type WithRelayProps<Query extends OperationType> = {
  preloadedQuery: PreloadedQuery<Query, Record<string, unknown>>;
  refresh: QueryRefresherType;
};

export type WithRelayOptions = {
  fallback?: ReactNode;
  serverSideProps?: (ctx: NextPageContext) => Promise<object>;
  [key: string]: unknown;
};
