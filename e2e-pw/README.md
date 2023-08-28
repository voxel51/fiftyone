## Getting Started Locally

-   Install playwright extension for VSCode.
-   Copy `.env.dev.template` into `.env.dev` and fill in the values.
-   Run `yarn` to install dependencies. Make sure you're using node 18.x.
    `nvm install 18 && nvm use 18`.
-   Run tests directly from VSCode or from the command line with `yarn e2e`, or
    start the UI mode using `yarn e2e:ui` command. If you're using a local dev
    build, read the following section.

### To use the local dev server of the app

-   This is useful if you want to run the tests against a local dev server of
    the app.
-   Set `export USE_DEV_BUILD=true` in `.env.dev` file.
-   Run `yarn devserver` to start the app dev server in a separate terminal
    window.
-   Proceed to run e2e tests as usual, from the CLI, VSCode, or Playwright UI.
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

#### Template for POMs

```typescript
class MyPOM {
    readonly semanticLocator1: Locator;
    readonly semanticLocator2: Locator;
    readonly assert: MyPOMAsserter;

    constructor(private readonly page) {
        this.semanticLocator1 = this.page.locator("...");
        this.semanticLocator2 = this.page.locator("...");
        this.assert = new MyPOMAsserter(this);
    }

    /**
     * All methods that return static locators should be decorated with `get`.
     */
    get someElement() {
        return this.page.locator("...");
    }

    /**
     * All methods that return dynamic locators should be prefixed with `get`.
     */
    getMyElement(param: string) {
        return this.page.locator(`...${param}...`);
    }

    /**
     * All actions should be verbs or prefixed with a verb.
     */
    async doSomeAction() {
        await this.someElement.click();
    }
}

class MyPOMAsserter {
    constructor(private readonly myPOM: MyPOM) {}

    async isFooVisible() {
        await expect(this.myPOM.someElement).toBeVisible();
    }
}
```

#### Screenshot Testing

1. Read [Playwright docs](https://playwright.dev/docs/test-snapshots) on this
   subject.
2. Since baseline screenshots are platform dependent, and our CI server runs on
   linux, to generate linux screenshots locally, run the following commands:

```
# create a docker image with playwright and python and fiftyone
yarn build-linux-screenshot-docker-image

# make sure mongod is running and available in your host machine at localhost:27017

# generate screenshots
# from e2e-pw directory, run:
docker run --rm --network host -v $(pwd):/work/ -w /work/ -it screenshot /bin/bash

# inside the docker container, run:
npx playwright test --update-snapshots -g "description of my test"
```

### Known Issues

#### Browser / Target has been closed

-   Most likely a missing `await` somewhere. Use VSCode eslint integration to
    get hints on missing `await`s.

#### Error: No tests found

-   This shows up randomly when running tests from VSCode. Run "Developer:
    Reload Window" to fix it.

#### Troubleshooting

The order of the steps is from the most to the least likely to fix the issue.

-   Run `yarn kill-port 8787` to kill any stray processes that might be running
    on port 8787.
-   Reload VSCode developer window.
-   Close all browser windows from previous test runs.
-   Restart the dev server.
