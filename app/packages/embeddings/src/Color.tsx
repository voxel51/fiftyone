export class Color {
  static fromCSSRGBValues(r, g, b) {
    return new Color(r / 255, g / 255, b / 255);
  }
  setBrightness(n: number) {
    const brightness = this.getBrightness();
    const diff = n - brightness;
    return new Color(this.r + diff, this.g + diff, this.b + diff);
  }
  getBrightness() {
    return (this.r + this.g + this.b) / 3;
  }
  constructor(public r: number, public g: number, public b: number) {}
  toCSSRGBString() {
    return `rgb(${this.r * 255}, ${this.g * 255}, ${this.b * 255})`;
  }
}
