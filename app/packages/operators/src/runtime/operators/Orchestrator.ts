type RawOrchestrator = {
  id: string;
  instance_id: string;
  description?: string;
  available_operators: string[];
  created_at: { $date: string };
  updated_at?: { $date: string };
  deactivated_at?: { $date: string };
};

/**
 * Class representing an orchestrator.
 */
export default class Orchestrator {
  constructor(
    public id: string,
    public instanceID: string,
    public description: string = null,
    public availableOperators: string[],
    public createdAt: Date,
    public updatedAt: Date = null,
    public deactivatedAt: Date = null
  ) {}

  /**
   * Creates an Orchestrator instance from a JSON object.
   * @param raw - The raw JSON data.
   * @returns An Orchestrator instance.
   */
  static fromJSON(raw: RawOrchestrator): Orchestrator {
    return new Orchestrator(
      raw.id,
      raw.instance_id,
      raw.description,
      raw.available_operators,
      new Date(raw.created_at.$date),
      raw.updated_at ? new Date(raw.updated_at.$date) : null,
      raw.deactivated_at ? new Date(raw.deactivated_at.$date) : null
    );
  }
}
