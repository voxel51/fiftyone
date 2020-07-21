import { setConsoleOptions, withConsole } from "@storybook/addon-console";
import { addDecorator } from "@storybook/react";
import React from "react";
import { RecoilRoot } from "recoil";

import { GlobalStyle } from "../app/shared/global";

addDecorator((story, context) => <>{withConsole()(story)(context)}</>);

addDecorator((story) => (
  <>
    <GlobalStyle />
    {story()}
  </>
));

addDecorator((story) => <RecoilRoot>{story()}</RecoilRoot>);

setConsoleOptions({
  panelExclude: [],
});
