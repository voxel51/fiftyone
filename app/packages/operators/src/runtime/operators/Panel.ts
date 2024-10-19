/**
 * Panel class representing an individual panel within the execution context.
 */
export default class Panel {
  public id: string;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Converts a JSON object to a Panel instance.
   *
   * @param json - JSON object representing the panel.
   * @returns Panel instance.
   */
  static fromJSON(json: { id: string }): Panel {
    return new Panel(json.id);
  }

  /**
   * Converts the Panel instance to JSON.
   *
   * @returns JSON object representing the panel.
   */
  toJSON(): { id: string } {
    return { id: this.id };
  }
}
