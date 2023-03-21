This directory contains a suite of black box and ui integration tests.

**Black Box E2E Tests**

These are intended to simulate real users, and use little to no
fakes/mocks/etc.

**UI Integration Tests**

For the app, it will be useful to mock the backend for some tests. In order to
avoid duplicate setups, both suites will exist here.

**Running Locally**

-   Make sure `python` is available in path. If you have a virtual environment
    you use, make sure to activate that.
-   Make a copy of `.env.cypress.example` and fill in the relevant values.
-   Run `yarn start`.
-   To run in watch mode, run `yarn start:watch` that launches cypress using
    nodemon.
-   You might find it useful that all command line options are forwarded to
    Cypress. For example, to run a single spec in headed mode, run
    `yarn start:watch --spec cypress/e2e/hello-world.cy.ts --headed`. For more
    options, visit
    [cypress command line](https://docs.cypress.io/guides/guides/command-line)
    page.

**Note: E2E tests communicate to the app via port 8787 and use `cypress` as the
database name.**

** Relevant Cypress environment variables ** These are Cypress environment
variables, as opposed to node environment variables. You can set these by
specifying the `--env` flag. For example, to collect baseline screenshots for
your specs and to pause between tests, you can run:

```
yarn start --env type=base,pause_between_tests=true
```

**TODO**

This is a WIP and there a few things that need to be setup in order for its
initial version to be viable:

-   [x] initial setup cypress
-   [x] run python from cypress
-   [x] verify approach works in a couple cases
-   [ ] setup on CI / github actions
-   [ ] document best practices
-   [ ] use renovate bot to automatically increment versions of libraries whose
        usage is covered
