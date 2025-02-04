import { Duration } from "src/oss/utils";

// time to wait for fiftyone app to load
export const DEFAULT_APP_LOAD_TIMEOUT = Duration.Minutes(2);
export const POPUP_DISMISS_TIMEOUT = Duration.Seconds(5);

export const DEFAULT_APP_PORT = 8787;
export const DEFAULT_APP_HOSTNAME = "0.0.0.0";
export const DEFAULT_APP_ADDRESS = `http://${DEFAULT_APP_HOSTNAME}:${DEFAULT_APP_PORT}`;
