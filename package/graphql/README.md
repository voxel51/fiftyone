# [IN DEVELOPMENT] FiftyOne's V2 shared GraphQL schema definition

This package represents the GraphQL SDL for FiftyOne version 2. This SDL
(schema definition language) is the shared data contract between the OSS
FiftyOne project and FiftyOne Teams. Queries, mutations, and subscriptions that
are valid against this SDL are guaranteed to be valid against the FiftyOne OSS
SDL, and the TEAMS SDL.

## Development

This package leverages [strawberry-graphql](https://strawberry.rocks/) for a
Pythonic source of truth for all input types, interfaces, mutations, object
types, and subscriptions.

## Organization

This a namespaced package accessible via `fiftyone.graphql`. Within this
package there are the following organization...TODO

Note that `strawberry-graphql` is based on Python's `dataclasses`, and this
package only aims to define the SDL via these dataclasses. They are abstract in
nature, and resolvers should not be implemented.

## Contributing

This package has code owners from the @voxel51/backend-devs and
@voxel51/frontend-devs teams. Although it cannot be explicitly enforced, every
pull request should be approved by at least one code owner from each team.
Concretely, approvals should occur only after considerations have been given
for both Teams and OSS software. Additions to the schema should be informed by
the existing shape of the Python SDK.

## [TODO] Testing

Regression tests that ensure behavior of mutations can and should be added
