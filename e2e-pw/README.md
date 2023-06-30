## Getting Started Locally

-   Install playwright extension for VSCode.
-   Copy `.env.dev.template` into `.env.dev` and fill in the values.
-   Run tests directly from VSCode or from the command line with `yarn e2e`.

### Known Issues

#### Browser / Target has been closed

-   Most likely a missing `await` somewhere
