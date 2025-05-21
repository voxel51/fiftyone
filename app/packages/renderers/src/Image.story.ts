import { Image } from "./Image";

export default {
  title: "Image",
  args: {},
};

export const Default = {
  render: (args, ctx) => {
    return new Image(args, ctx.parameters.pixi.appReady);
  },
};
