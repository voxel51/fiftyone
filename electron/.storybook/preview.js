import { setConsoleOptions, withConsole } from "@storybook/addon-console";
import { addDecorator } from "@storybook/react";
import React, { Fragment } from "react";
import { RecoilRoot } from "recoil";

addDecorator((storyFn, context) => (
  <>
    <RecoilRoot>{withConsole()(storyFn)(context)}</RecoilRoot>
  </>
));
setConsoleOptions({
  panelExclude: [],
});
