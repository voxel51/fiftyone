## Getting Started Locally

-   Install playwright extension for VSCode.
-   Copy `.env.dev.template` into `.env.dev` and fill in the values.
-   Run tests directly from VSCode or from the command line with `yarn e2e`.

### To use the local dev server of the app

-   This is useful if you want to run the tests against a local dev server of
    the app.
-   Set `export USE_DEV_BUILD=true` in `.env.dev` file.
-   Either make sure app is already running on `localhost:5173` with
    `VITE_API=http://localhost:8787` in `app/packages/app/.env.development`
    file, or run `yarn devserver` to start the app dev server.

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
