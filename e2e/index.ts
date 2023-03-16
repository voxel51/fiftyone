import cypress from "cypress";
import http from "http";

const runCypress = () => {
  const args = ["cypress", "run", "--browser", "chrome", "--headless"];

  cypress.cli
    .parseRunArguments([...args, ...process.argv.slice(2)])
    .then((options) => cypress.run(options))
    .catch((err) => console.error(err));
};

// THIS IS A HACK
const ghostServer = http
  .createServer((_, res) => {
    res.writeHead(200);
  })
  .listen(5151, () => {
    // cypress does work with `null` baseUrl but that causes tests to run twice
    // it's because cypress caches test runner process for each unique baseUrl
    // todo: better strategy?
    console.log(
      "ghost fiftyone server started. ignore this message, just placating cypress because it needs a valid baseUrl when it starts"
    );

    runCypress();
  });

setTimeout(() => {
  ghostServer.close();
  console.log("ghost fiftyone server stopped. ignore this message.");
  // this time needs to be just enough to allow cypress to start but not more
}, 4000);
