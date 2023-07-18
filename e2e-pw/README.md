## Getting Started Locally

-   Install playwright extension for VSCode.
-   Copy `.env.dev.template` into `.env.dev` and fill in the values.
-   Run `yarn` to install dependencies. Make sure you're using node 18.x.
    `nvm install 18 && nvm use 18`.
-   Run tests directly from VSCode or from the command line with `yarn e2e`.

### To use the local dev server of the app

-   This is useful if you want to run the tests against a local dev server of
    the app.
-   Set `export USE_DEV_BUILD=true` in `.env.dev` file.
-   Run `yarn devserver` to start the app dev server in a separate terminal
    window on port 5193.
-   Proceed to run e2e tests as usual, from CLI or from VSCode.
-   **NOTE: Parallelization doesn't work with dev build.**

### Tips

1. Install the eslint extension. Also set `estlint.options` to
   `{"overrideConfigFile": ".eslintrc.js"}` in VSCode settings to get linting
   in the editor.

### Patterns

-   Use POMs where applicable, e.g. for pages, or for common components like
    grid, modal, sidebar.
-   Do not use assertion logic directly in POMs, instead use composition to
    create POMs that contain the assertion class.
-   Refrain from using `page.waitForTimeout()`. There is always a better
    alternative.

### Known Issues

#### Browser / Target has been closed

-   Most likely a missing `await` somewhere. Use VSCode eslint integration to
    get hints on missing `await`s.

#### Error: No tests found

-   This shows up randomly when running tests from VSCode. Run "Developer:
    Reload Window" to fix it.

#### Troubleshooting

-   Close all stray browser windows from previous test runs.
-   Reload VSCode developer window.
-   Try again.
