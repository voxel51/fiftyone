This directory contains a suite of black box and ui integration tests.

**Black Box E2E Tests**

These are intended to simulate real users, and use little to no fakes/mocks/etc.

**UI Integration Tests**

For the app, it will be useful to mock the backend for some tests. In order to avoid duplicate setups, both suites will exist here.

**TODO**

This is a WIP and there a few things that need to be setup in order for its initial version to be viable:

 - [x] initial setup cypress
 - [x] define tests approach (see below)
 - [x] verify approach works in a couple cases
 - [x] run python from cypress
 - [ ] setup on CI / github actions
 - [ ] modify install.bash to setup cypress for dev installs
 - [ ] update this readme once more fleshed out

 **Approach**

See e2e/cypress/integration/quickstart/smoke.spec.ts