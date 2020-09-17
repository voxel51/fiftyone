import { setConsoleOptions, withConsole } from "@storybook/addon-console";
import { withKnobs, radios } from "@storybook/addon-knobs";
import { addDecorator } from "@storybook/react";
import React, { useState } from "react";
import { Provider } from "react-redux";
import { RecoilRoot } from "recoil";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../app/shared/global";
import { lightTheme, darkTheme } from "../app/shared/colors";
import { viewBarKeyMap } from "../app/components/ViewBar/ViewBar";
import { configureStore } from "../app/store/configureStore";

addDecorator((story, context) => <>{withConsole()(story)(context)}</>);
addDecorator(withKnobs);

addDecorator((story) => (
  <>
    <GlobalStyle />
    {story()}
  </>
));

addDecorator((story) => <RecoilRoot>{story()}</RecoilRoot>);

addDecorator((story) => {
  const [store] = useState(configureStore());
  return <Provider store={store}>{story()}</Provider>;
});

const themeChoices = {
  Dark: darkTheme,
  Light: lightTheme,
};
const getTheme = () => {
  const raw = radios(
    "Theme",
    Object.fromEntries(Object.keys(themeChoices).map((k) => [k, k])),
    "Dark"
  );
  return themeChoices[raw];
};
addDecorator((story) => (
  <ThemeProvider theme={getTheme()}>{story()}</ThemeProvider>
));

setConsoleOptions({
  panelExclude: [],
});
