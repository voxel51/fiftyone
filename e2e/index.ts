import Percy from "@percy/core";
import cypress from "cypress";
import { config as dotEnvConfig } from "dotenv";
import { createServer } from "http";
import { DEFAULT_APP_PORT } from "lib/constants";

dotEnvConfig({ path: ".env.cypress" });

const runCypress = () => {
  const args = ["cypress", "run", "--browser", "chrome"];

  cypress.cli
    .parseRunArguments([...args, ...process.argv.slice(2)])
    .then((options) => {
      console.log("cypress run options", options);
      cypress.run(options);
    })
    .catch((err) => console.error(err));
};

// THIS IS A HACK
const ghostServer = createServer((_, res) => {
  res.writeHead(200);
}).listen(DEFAULT_APP_PORT, () => {
  // cypress does work with `null` baseUrl but that causes tests to run twice
  // it's because cypress caches test runner process for each unique baseUrl
  // todo: better strategy?
  console.log(
    "ghost fiftyone server started. ignore this message, just placating cypress because it needs a valid baseUrl when it starts"
  );

  Percy.start()
    .then(() => {
      console.log("percy started");
    })
    .catch((e) => {
      console.error("percy failed to start", e);
    })
    .finally(() => {
      runCypress();
    });
});

setTimeout(() => {
  ghostServer.close();
  console.log("ghost fiftyone server stopped. ignore this message.");
  // this time needs to be just enough to allow cypress to start but not more
}, 4000);
