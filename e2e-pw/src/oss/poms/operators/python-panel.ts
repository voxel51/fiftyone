import { EventUtils } from "src/shared/event-utils";

/** A Python panel, observed through the renders the App reports for it */
export class PythonPanelPom {
  constructor(
    private readonly eventUtils: EventUtils,
    readonly name: string,
  ) {}

  /**
   * Run `action` (an open, or a click on one of the panel's buttons) and
   * resolve once the panel has rendered with no panel event still in flight
   */
  afterRender<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after(
      "e2e:operators:panel-rendered",
      action,
      (e) => {
        const { panelName, pending } = e.detail as {
          panelName: string;
          pending: number;
        };
        return panelName === this.name && pending === 0;
      },
    );
  }
}
