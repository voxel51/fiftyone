import { Assets, Container, Sprite } from "pixi.js";
import Detection from "./Detection";

export default {
  title: "Detection",
  args: {},
};

export class DetectionStory {
  readonly view = new Container();
  readonly detection = new Detection();

  constructor(_, appReady) {
    appReady.then(async () => {
      const tex = await Assets.load("wilford.jpg");
      const image = new Sprite(tex);

      this.view.addChild(image);

      this.view.pivot.x = this.view.width / 2;
      this.view.pivot.y = this.view.height / 2;
    });
  }

  resize(w, h) {
    this.view.x = w / 2;
    this.view.y = h / 2;
  }

  update(ticker) {}

  destroy() {
    this.view.destroy(true);
  }
}

export const Default = {
  render: (args, ctx) => {
    return new DetectionStory(args, ctx.parameters.pixi.appReady);
  },
};
