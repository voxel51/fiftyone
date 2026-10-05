import Aggregation from "./Aggregation";

export type BoundsParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class Bounds extends Aggregation {
  constructor(params: BoundsParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Bounds";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type CountParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class Count extends Aggregation {
  constructor(params: CountParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Count";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type CountValuesParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class CountValues extends Aggregation {
  constructor(params: CountValuesParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.CountValues";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type DistinctParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class Distinct extends Aggregation {
  constructor(params: DistinctParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Distinct";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type HistogramValuesParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  bins?: unknown;
  range?: unknown;
  auto?: unknown;
};

export class HistogramValues extends Aggregation {
  constructor(params: HistogramValuesParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.HistogramValues";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        bins: "bins",
        range: "range",
        auto: "auto",
      }),
    );
  }
}

export type MeanParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class Mean extends Aggregation {
  constructor(params: MeanParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Mean";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type StdParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
  sample?: unknown;
};

export class Std extends Aggregation {
  constructor(params: StdParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Std";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
        sample: "sample",
      }),
    );
  }
}

export type SumParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  safe?: unknown;
};

export class Sum extends Aggregation {
  constructor(params: SumParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Sum";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        safe: "safe",
      }),
    );
  }
}

export type ValuesParams = {
  fieldOrExpr?: unknown;
  expr?: unknown;
  missingValue?: unknown;
  unwind?: unknown;
};

export class Values extends Aggregation {
  constructor(params: ValuesParams = null) {
    super();
    this.params = params;
    this._cls = "fiftyone.core.aggregations.Values";
    this._nameMap = new Map(
      Object.entries({
        fieldOrExpr: "field_or_expr",
        expr: "expr",
        missingValue: "missing_value",
        unwind: "unwind",
      }),
    );
  }
}
