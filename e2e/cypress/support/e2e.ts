// this file (default support file) runs before every test
import compareSnapshotCommand from "cypress-visual-regression/dist/command";

import "./commands";

compareSnapshotCommand({ capture: "runner", overwrite: true });
