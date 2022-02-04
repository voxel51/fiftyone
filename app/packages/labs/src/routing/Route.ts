import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";
import Resource from "./Resource";
import { RouteComponent } from "./RouteComponent";

export default interface Route {
  path?: string;
  exact?: boolean;
  component: Resource<RouteComponent>;
  prepare: (params: any) => Resource<PreloadedQuery<OperationType>>;
  routes?: Route[];
}
