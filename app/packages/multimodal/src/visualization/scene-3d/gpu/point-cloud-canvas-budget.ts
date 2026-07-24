/** One point-cloud draw competing for a canvas-owned point budget. */
export interface PointCloudBudgetDemand {
  readonly id: string;
  readonly pointCount: number;
  /** Relative visual value of one point in this draw. */
  readonly weight?: number;
}

/**
 * Distributes one canvas budget across every visible point-cloud draw.
 *
 * Small clouds are satisfied first and their unused share is redistributed.
 * Remaining draws split the budget by weight without exceeding their
 * available nested sample prefix.
 */
export function allocatePointCloudCanvasBudget(
  demands: readonly PointCloudBudgetDemand[],
  totalPointBudget: number,
): ReadonlyMap<string, number> {
  const allocations = new Map<string, number>();
  const budget = normalizedPointCount(totalPointBudget);
  const active = demands
    .map((demand, order) => ({
      id: demand.id,
      order,
      pointCount: normalizedPointCount(demand.pointCount),
      weight: normalizedWeight(demand.weight),
    }))
    .filter((demand) => demand.pointCount > 0);

  for (const demand of demands) allocations.set(demand.id, 0);
  if (budget === 0 || active.length === 0) return allocations;

  let remainingBudget = budget;
  let remaining = active;
  while (remaining.length > 0 && remainingBudget > 0) {
    const totalWeight = remaining.reduce(
      (sum, demand) => sum + demand.weight,
      0,
    );
    const satisfied = remaining.filter(
      (demand) =>
        demand.pointCount <=
        Math.floor((remainingBudget * demand.weight) / totalWeight),
    );
    if (satisfied.length === 0) break;

    const satisfiedIds = new Set(satisfied.map((demand) => demand.id));
    for (const demand of satisfied) {
      allocations.set(demand.id, demand.pointCount);
      remainingBudget -= demand.pointCount;
    }
    remaining = remaining.filter((demand) => !satisfiedIds.has(demand.id));
  }

  if (remaining.length === 0 || remainingBudget <= 0) return allocations;

  const totalWeight = remaining.reduce((sum, demand) => sum + demand.weight, 0);
  const remainders: Array<{
    readonly id: string;
    readonly order: number;
    readonly remainder: number;
  }> = [];
  let assigned = 0;
  for (const demand of remaining) {
    const exactShare = (remainingBudget * demand.weight) / totalWeight;
    const share = Math.min(demand.pointCount, Math.floor(exactShare));
    allocations.set(demand.id, share);
    assigned += share;
    remainders.push({
      id: demand.id,
      order: demand.order,
      remainder: exactShare - share,
    });
  }

  let leftover = remainingBudget - assigned;
  remainders.sort(
    (left, right) =>
      right.remainder - left.remainder || left.order - right.order,
  );
  while (leftover > 0) {
    let advanced = false;
    for (const demand of remainders) {
      const source = remaining.find((candidate) => candidate.id === demand.id);
      const current = allocations.get(demand.id) ?? 0;
      if (!source || current >= source.pointCount) continue;
      allocations.set(demand.id, current + 1);
      leftover--;
      advanced = true;
      if (leftover === 0) break;
    }
    if (!advanced) break;
  }

  return allocations;
}

export interface PointCloudCanvasBudgetView {
  readonly area: number;
  readonly demands: readonly Omit<PointCloudBudgetDemand, "weight">[];
  readonly weight?: number;
}

/**
 * Mutable budget registry for canvases that render several independently
 * mounted/scissored views through one GPU device.
 */
export class PointCloudCanvasBudget {
  private allocations = new Map<string, ReadonlyMap<string, number>>();
  private readonly listeners = new Set<() => void>();
  private readonly views = new Map<string, PointCloudCanvasBudgetView>();

  constructor(private readonly totalPointBudget: number) {}

  allocation(viewId: string): ReadonlyMap<string, number> {
    return this.allocations.get(viewId) ?? EMPTY_POINT_CLOUD_BUDGET;
  }

  removeView(viewId: string): void {
    if (!this.views.delete(viewId)) return;
    this.recompute();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateView(viewId: string, view: PointCloudCanvasBudgetView): void {
    if (sameView(this.views.get(viewId), view)) return;
    this.views.set(viewId, view);
    this.recompute();
  }

  private recompute(): void {
    const demands: PointCloudBudgetDemand[] = [];
    for (const [viewId, view] of this.views) {
      const viewWeight =
        normalizedWeight(view.weight) * Math.max(1, finiteArea(view.area));
      const layerWeight =
        view.demands.length > 0 ? viewWeight / view.demands.length : 0;
      for (const demand of view.demands) {
        demands.push({
          id: budgetDemandKey(viewId, demand.id),
          pointCount: demand.pointCount,
          weight: layerWeight,
        });
      }
    }

    const global = allocatePointCloudCanvasBudget(
      demands,
      this.totalPointBudget,
    );
    const next = new Map<string, ReadonlyMap<string, number>>();
    for (const [viewId, view] of this.views) {
      next.set(
        viewId,
        new Map(
          view.demands.map(
            (demand) =>
              [
                demand.id,
                global.get(budgetDemandKey(viewId, demand.id)) ?? 0,
              ] as const,
          ),
        ),
      );
    }
    if (sameAllocations(this.allocations, next)) return;
    this.allocations = next;
    for (const listener of this.listeners) listener();
  }
}

export const EMPTY_POINT_CLOUD_BUDGET: ReadonlyMap<string, number> = new Map();

function budgetDemandKey(viewId: string, demandId: string): string {
  return `${viewId}\0${demandId}`;
}

function finiteArea(area: number): number {
  return Number.isFinite(area) && area > 0 ? area : 1;
}

function normalizedPointCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizedWeight(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

function sameView(
  left: PointCloudCanvasBudgetView | undefined,
  right: PointCloudCanvasBudgetView,
): boolean {
  return (
    left?.area === right.area &&
    left.weight === right.weight &&
    left.demands.length === right.demands.length &&
    left.demands.every(
      (demand, index) =>
        demand.id === right.demands[index]?.id &&
        demand.pointCount === right.demands[index]?.pointCount,
    )
  );
}

function sameAllocations(
  left: ReadonlyMap<string, ReadonlyMap<string, number>>,
  right: ReadonlyMap<string, ReadonlyMap<string, number>>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [viewId, allocation] of left) {
    const candidate = right.get(viewId);
    if (!candidate || allocation.size !== candidate.size) return false;
    for (const [demandId, count] of allocation) {
      if (candidate.get(demandId) !== count) return false;
    }
  }
  return true;
}
