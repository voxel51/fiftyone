import Rendering from "./Rendering";

export default {
  title: "Rendering",
  args: {},
};

export const Default = {
  render: (args, ctx) => {
    ctx.parameters.pixi.appReady.then(() => {
      if (ctx.parameters.pixi.app) {
        console.log(ctx.parameters.pixi.app?.screen);
      }
    });

    const rendering = new Rendering(
      ctx.parameters.pixi.app,
      ctx.parameters.pixi.appReady
    );

    return {
      resize: (w, h, ...a) => {
        rendering.container.x = w / 2;
        rendering.container.y = h / 2;
      },
      update: () => {},
      destroy: () => {},
      view: rendering?.container,
    };
  },
};
