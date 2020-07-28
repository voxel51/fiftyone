import { setConsoleOptions, withConsole } from "@storybook/addon-console";
import { withKnobs, radios } from "@storybook/addon-knobs";
import { addDecorator } from "@storybook/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../app/shared/global";
import { lightTheme, darkTheme } from "../app/shared/colors";

addDecorator((story, context) => <>{withConsole()(story)(context)}</>);
addDecorator(withKnobs);

addDecorator((story) => (
  <>
    <GlobalStyle />
    {story()}
  </>
));

addDecorator((story) => <RecoilRoot>{story()}</RecoilRoot>);

const themeChoices = {
  Light: lightTheme,
  Dark: darkTheme,
};
const getTheme = () => {
  const raw = radios(
    "Theme",
    Object.fromEntries(Object.keys(themeChoices).map((k) => [k, k])),
    "Light"
  );
  return themeChoices[raw];
};
addDecorator((story) => (
  <ThemeProvider theme={getTheme()}>{story()}</ThemeProvider>
));

setConsoleOptions({
  panelExclude: [],
});
