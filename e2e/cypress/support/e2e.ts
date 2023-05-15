// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

compareSnapshotCommand({
  capture: "viewport",
  overwrite: true,
  errorThreshold: 0,
});

// todo: check if app port is available in beforeAll() and fail fast if not
