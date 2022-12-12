import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";
import ThemeProvider from "../src/components/ThemeProvider/StorybookThemeProvider";
import { extendTheme as extendJoyTheme, Theme } from "@mui/joy/styles";
import {
  createTheme,
  Experimental_CssVarsProvider as CssVarsProvider,
} from "@mui/material/styles";
import Button from "../src/components/Button";
import { button } from "../src/components/Button/Button.module.css";

// More on default export: https://storybook.js.org/docs/react/writing-stories/introduction#default-export
export default {
  title: "Example/Button",
  component: Button,
  // More on argTypes: https://storybook.js.org/docs/react/api/argtypes
  argTypes: {
    backgroundColor: { control: "color" },
  },
} as ComponentMeta<typeof Button>;

// More on component templates: https://storybook.js.org/docs/react/writing-stories/introduction#using-args
const Template: ComponentStory<typeof Button> = (args) => (
  <ThemeProvider>
    <Button {...args}>Test</Button>
  </ThemeProvider>
);

export const Primary = Template.bind({});
// More on args: https://storybook.js.org/docs/react/writing-stories/args
Primary.args = {
  title: "Voxel 51",
};
