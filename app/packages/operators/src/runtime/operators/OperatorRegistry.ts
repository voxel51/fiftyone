import Operator from "./Operator";

export default class OperatorRegistry {
  private operators: Map<string, Operator> = new Map();

  register(operator: Operator): void {
    this.operators.set(operator.uri, operator);
  }

  getOperator(uri: string): Operator | undefined {
    return this.operators.get(uri);
  }

  operatorExists(uri: string): boolean {
    return this.operators.has(uri);
  }

  listOperators(): Operator[] {
    return Array.from(this.operators.values());
  }
}

export const localRegistry = new OperatorRegistry();
export const remoteRegistry = new OperatorRegistry();
