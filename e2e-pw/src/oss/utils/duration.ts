export class Duration {
  static Seconds(seconds: number) {
    return seconds * 1000;
  }

  static Minutes(minutes: number) {
    return minutes * 1000 * 60;
  }
}
