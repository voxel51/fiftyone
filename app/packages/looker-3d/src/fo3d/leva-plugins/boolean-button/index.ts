import { createPlugin } from "leva/plugin";
import { BooleanButton } from "./BooleanButton";
import * as props from "./plugin";

export const booleanButton = createPlugin({
  component: BooleanButton,
  ...props,
});
