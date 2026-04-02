/**
 * RTK Query API slice — hackday experiment.
 *
 * Demonstrates RTK Query running alongside Jotai/Recoil without interfering.
 * Hits the existing /fiftyone REST endpoint and the /graphql endpoint.
 */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const BACKEND_BASE = `http://127.0.0.1:${
  import.meta.env.FIFTYONE_DEFAULT_APP_PORT || "5151"
}/`;

export const fiftyoneApi = createApi({
  reducerPath: "fiftyoneApi",
  baseQuery: fetchBaseQuery({ baseUrl: BACKEND_BASE }),
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

    /** Fetch a sample by dataset name + sample ID via GraphQL */
    getSample: builder.query<
      unknown,
      { dataset: string; sampleId: string }
    >({
      query: ({ dataset, sampleId }) => ({
        url: "graphql",
        method: "POST",
        body: {
          query: `
            query GetSample($dataset: String!, $view: BSONArray!, $filter: SampleFilter!) {
              sample(dataset: $dataset, view: $view, filter: $filter) {
                ... on ImageSample {
                  id
                  sample
                  urls { field url }
                  aspectRatio
                }
                ... on PointCloudSample {
                  id
                  sample
                  urls { field url }
                }
                ... on VideoSample {
                  id
                  sample
                  urls { field url }
                  aspectRatio
                }
              }
            }
          `,
          variables: {
            dataset,
            view: [],
            filter: { id: sampleId },
          },
        },
      }),
      transformResponse: (response: any) => response?.data?.sample,
    }),
  }),
});

export const { useGetAppInfoQuery, useGraphqlQuery, useGetSampleQuery } =
  fiftyoneApi;
