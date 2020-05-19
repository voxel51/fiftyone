import _ from "lodash";
import React, { useState } from "react";
import { Search } from "semantic-ui-react";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

export default connect(function (props) {
  const { dispatch, port } = props;
  const [initialLoad, setInitialLoad] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sValue, setValue] = useState("");
  const [results, setResults] = useState([]);
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(true);
  const socket = getSocket(port, "state");

  const getFacets = () => {
    socket.emit("get_facets", "", (data) => {
      const tags = data.length
        ? Object.keys(data[0].tags).map((k) => {
            return { title: `tags.${data[0].tags[k]._id}` };
          })
        : [];
      setFacets(tags);
      setFacetsLoading(false);
      setInitialLoad(true);
    });
  };

  const onSelect = (e, { result }) => {
    setValue(result.title);
    socket.emit("set_facets", result.title);
  };

  const onSearch = (e, { value }) => {
    setValue(value);
    setTimeout(() => {
      if (value.length < 1) {
        setValue("");
        setResults([]);
      }
      const re = new RegExp(_.escapeRegExp(value), "i");
      const isMatch = (result) => re.test(result.title);
      setResults(_.filter(facets, isMatch));
    }, 300);
  };

  useSubscribe(socket, "update", (data) => {
    setFacetsLoading(true);
    getFacets();
  });

  if (!initialLoad) {
    getFacets();
  }
  return (
    <>
      <Search
        results={results}
        value={sValue}
        onResultSelect={onSelect}
        onSearchChange={_.debounce(onSearch, 500, { leading: true })}
      />
    </>
  );
});
