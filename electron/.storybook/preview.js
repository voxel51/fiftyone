import { setConsoleOptions, withConsole } from "@storybook/addon-console";
import { addDecorator } from "@storybook/react";

addDecorator((storyFn, context) => withConsole()(storyFn)(context));
setConsoleOptions({
  panelExclude: [],
});
