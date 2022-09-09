import { useContext, useEffect } from "react";
import { OperationType } from "relay-runtime";
import { Entry, RouterContext } from "./RouterContext";

export default (callback: (entry: Entry<OperationType>) => void) => {
  const router = useContext(RouterContext);
  useEffect(() => router.subscribe(callback), [router, callback]);
};
