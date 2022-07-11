import Aggregation from "./Aggregation";

export type BoundsParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type CountParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type CountValuesParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type DistinctParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type HistogramValuesParams = {
  fieldOrExpr?: any;
  expr?: any;
  bins?: any;
  range?: any;
  auto?: any;
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
      })
    );
  }
}

export type MeanParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type StdParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
  sample?: any;
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
      })
    );
  }
}

export type SumParams = {
  fieldOrExpr?: any;
  expr?: any;
  safe?: any;
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
      })
    );
  }
}

export type ValuesParams = {
  fieldOrExpr?: any;
  expr?: any;
  missingValue?: any;
  unwind?: any;
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
      })
    );
  }
}
