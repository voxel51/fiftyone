## How to run the tests

To run the e2e tests locally, first you need to set up voxel-hub running
locally using internal airgapped mode with keycloak setup.

References:

Follow this
[CAS Keycloak setup guidance](https://docs.google.com/document/d/1FZ0s9LHOGU_8X951AxhR09m7VdnT5Nr-pxCa0A9ScvM/edit?usp=sharing)
and run the app.

Set up the license file (with `allowAirGapped: true`) properly: Generate a
local dev license [here](https://license.dev.fiftyone.ai/) Update the license
file path in the voxel hub .env to use the correct license.

-   copy `.env.dev.template` and add them to `.env.dev`, update values as
    required
-   run `yarn e2e:ui`
