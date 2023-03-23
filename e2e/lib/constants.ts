import { Duration } from "../cypress/support/utils";

// time to wait for fiftyone app to load
export const DEFAULT_APP_LOAD_TIMEOUT = Duration.Seconds(20);

export const DEFAULT_APP_PORT = 8787;
export const DEFAULT_APP_ADDRESS = `http://127.0.0.1:${DEFAULT_APP_PORT}`;
