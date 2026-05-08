export default {
  stories: [
    "./../../**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(config, {
      plugins: [
        {
          // Stub .svg?react imports — returns a no-op React component.
          // Avoids needing vite-plugin-svgr in the Storybook config.
          name: "svg-react-stub",
          transform(_code, id) {
            if (!id.includes(".svg?react")) return null;
            return `import React from "react";
export default function SvgStub(props) { return React.createElement("span", props); }`;
          },
        },
      ],
    });
  },
};
