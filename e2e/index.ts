import cypress from "cypress";
import { config as dotEnvConfig } from "dotenv";
import { createServer } from "http";
import cypressConfig from "./cypress.config";
import { DEFAULT_APP_PORT } from "./lib/constants";

dotEnvConfig({ path: ".env.cypress" });

const runCypress = async () => {
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

  return cypress.run(options);
};

// THIS IS A HACK
const ghostServer = createServer((_, res) => {
  res.writeHead(200);
}).listen(DEFAULT_APP_PORT, async () => {
  // cypress does work with `null` baseUrl but that causes tests to run twice
  // it's because cypress caches test runner process for each unique baseUrl
  // todo: better strategy?
  console.log(
    "ghost fiftyone server started. ignore this message, just placating cypress because it needs a valid baseUrl when it starts"
  );

  await runCypress();
});

setTimeout(() => {
  ghostServer.close();
  console.log("ghost fiftyone server stopped. ignore this message.");
  // this time needs to be just enough to allow cypress to start but not more
}, 4000);
