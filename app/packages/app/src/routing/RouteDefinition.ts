import { Resource } from "@fiftyone/utilities";
import { ConcreteRequest, OperationType, VariablesOf } from "relay-runtime";
import { LocationState, Route } from ".";

export interface RouteDefinition<T extends OperationType> {
  component: Resource<Route<T>>;
  path: string;
  query: Resource<ConcreteRequest>;
  searchParams?: { [key: string]: string };
}

export interface RouteOptions<T extends OperationType> {
  component: () => Promise<Route<T>>;
  query: () => Promise<ConcreteRequest>;
  searchParams?: { [key: string]: string };
  transform?: (
    state: LocationState<T>,
    variables: Partial<VariablesOf<T>>
  ) => Partial<VariablesOf<T>>;
}

export default RouteDefinition;
