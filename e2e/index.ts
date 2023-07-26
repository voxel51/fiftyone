import cypress from "cypress";
import { config as dotEnvConfig } from "dotenv";

dotEnvConfig({ path: ".env.cypress" });

(async () => {
  const args = ["cypress", "run", "--browser", "chrome", "--headed"];

  const options = await cypress.cli.parseRunArguments([
    ...args,
    ...(process.argv?.length > 2 ? process.argv.slice(2) : []),
  ]);

  // note: cypress env is being parsed as string instead of object
  const cliEnvOptions = options.env as unknown as string;
  // type is used to determine if we're collecting screenshots (type=base) or running the actual tests (type=actual)
  if (!cliEnvOptions?.includes("type=")) {
    if (cliEnvOptions?.length > 0) {
      // @ts-ignore - this is a hack to get around the fact that cypress is parsing the env as a string
      options.env = `${cliEnvOptions},type=actual`;
    } else {
      // @ts-ignore - this is a hack to get around the fact that cypress is parsing the env as a string
      options.env = "type=actual";
    }
  }

  console.log("cypress options", options);

  if (!options.headed) {
    throw new Error(
      "Cypress is running in headless mode, but screenshotting doesn't work as expected in this mode with looker. See https://github.com/cypress-io/cypress/issues/15605 for more details."
    );
  }

  cypress.run(options).then((result) => {
    if (result.status === "failed") {
      process.exit(1);
    }

    process.exit(result.totalFailed);
  });
})();
