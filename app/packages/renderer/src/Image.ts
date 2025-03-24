import { Assets, Container, Sprite } from "pixi.js";

export class Image {
  readonly view = new Container();
  constructor(_, appReady) {
    appReady.then(async () => {
      const tex = await Assets.load("wilford.jpg");
      const image = new Sprite(tex);

      this.view.addChild(image);

      this.view.pivot.x = this.view.width / 2 - 200;
      this.view.pivot.y = this.view.height / 2;
    });
  }

  resize(w, h) {
    this.view.x = w / 2;
    this.view.y = h / 2;
  }

  update(ticker) {
    this.view.rotation -= 0.01 * ticker.deltaTime;
    this.view.scale.x = this.view.scale.x + 0.1 * ticker.deltaTime;
    this.view.scale.y = this.view.scale.y + 0.1 * ticker.deltaTime;
  }

  destroy() {
    this.view.destroy(true);
  }
}
