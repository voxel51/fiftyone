export default class Aggregation {
  _cls: string;
  _nameMap: Map<string, string>;
  params: object;
  toJSON(): {
    _cls: string;
    kwargs: Array<Array<any>>;
  } {
    const _cls = this._cls;
    const kwargs = [];
    if (this.params) {
      for (const [paramName, paramValue] of Object.entries(this.params)) {
        if (paramName) {
          kwargs.push([this._getSerializedName(paramName), paramValue]);
        }
      }
    }

    return { _cls, kwargs };
  }
  private _getSerializedName(paramName: string) {
    if (this._nameMap.has(paramName)) {
      return this._nameMap.get(paramName);
    }
    return paramName;
  }
}
