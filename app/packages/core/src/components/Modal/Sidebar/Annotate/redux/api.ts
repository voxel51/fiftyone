/**
 * RTK Query API slice — hackday experiment.
 *
 * Demonstrates RTK Query running alongside Jotai/Recoil without interfering.
 * Hits the existing /fiftyone REST endpoint and the /graphql endpoint.
 */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const fiftyoneApi = createApi({
  reducerPath: "fiftyoneApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `http://127.0.0.1:${
      (typeof import.meta !== "undefined" &&
        import.meta.env?.FIFTYONE_DEFAULT_APP_PORT) ||
      "5151"
    }/`,
  }),
  endpoints: (builder) => ({
    /** GET /fiftyone — returns { version, dev } */
    getAppInfo: builder.query<{ version: string; dev: boolean }, void>({
      query: () => "fiftyone",
    }),

    /** POST /graphql — run an arbitrary GraphQL query */
    graphql: builder.query<
      unknown,
      { query: string; variables?: Record<string, unknown> }
    >({
      query: ({ query, variables }) => ({
        url: "graphql",
        method: "POST",
        body: { query, variables },
      }),
    }),
  }),
});

export const { useGetAppInfoQuery, useGraphqlQuery } = fiftyoneApi;
