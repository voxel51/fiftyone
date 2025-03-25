const preview = {
  parameters: {
    layout: "fullscreen",
    pixi: {
      // these are passed as options to `PIXI.Application` when instantiated by the
      // renderer
      applicationOptions: {
        backgroundColor: 0x1099bb,
        resolution: 1,
      },
      // optional, if you want to provide custom resize logic, pass a function here,
      // if nothing is provided, the default resize function is used, which looks like
      // this, where w and h will be the width and height of the storybook canvas.
      resizeFn: (w, h) => {
        return {
          rendererWidth: w,
          rendererHeight: h,
          canvasWidth: w,
          canvasHeight: h,
        };
      },
    },
  },
};

export default preview;
