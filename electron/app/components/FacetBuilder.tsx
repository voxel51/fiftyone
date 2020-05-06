import React, { useState } from "react";
import { Search } from "semantic-ui-react";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

function FacetBuilder(props) {
  const [initialLoad, setInitialLoad] = useState(false);
  const [loading, isLoading] = useState(false);
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(true);
  const socket = getSocket("state");
  const getFacets = () => {
    socket.emit("get_facets", "", (data) => {
      setFacets(data);
      setFacetsLoading(false);
      setInitialLoad(true);
    });
  };
  useSubscribe(socket, "update", (data) => {
    setLoading(true);
    getFacets();
  });

  if (!initialLoad) {
    getData();
  }

  console.log(facets);

  return <Search loading={loading} style={{ width: "100%" }} />;
}

export default connect(FacetBuilder);
