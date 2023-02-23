import { Resource } from "@fiftyone/utilities";
import { ConcreteRequest } from "relay-runtime";
import { Queries, Route } from ".";

export interface RouteDefinition<T extends Queries> {
  component: Resource<Route<T>>;
  path: string;
  query: Resource<ConcreteRequest>;
  searchParams?: { [key: string]: string };
}

export interface RouteOptions<T extends Queries> {
  component: () => Promise<Route<T>>;
  path: string;
  query: () => Promise<ConcreteRequest>;
  searchParams?: { [key: string]: string };
}

export default RouteDefinition;
