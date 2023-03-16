This directory contains a suite of black box and ui integration tests.

**Black Box E2E Tests**

These are intended to simulate real users, and use little to no
fakes/mocks/etc.

**UI Integration Tests**

For the app, it will be useful to mock the backend for some tests. In order to
avoid duplicate setups, both suites will exist here.

**Running Locally**

-   Make sure `python` is available in path.
-   Run `yarn start`.
-   To run in watch mode, run `yarn start:watch`.
-   If you want additional flexibility, all command line options are forwarded
    to Cypress. For example, to run a single spec, run
    `yarn start --spec cypress/e2e/hello-world.cy.ts`. For more options, visit
    [cypress command line](https://docs.cypress.io/guides/guides/command-line)
    page.

**TODO**

This is a WIP and there a few things that need to be setup in order for its
initial version to be viable:

-   [x] initial setup cypress
-   [x] run python from cypress
-   [x] verify approach works in a couple cases
-   [ ] setup on CI / github actions
-   [ ] document best practices
