import _ from "lodash";
import React, { Component, useState, useRef, useEffect } from "react";
import { InfiniteLoader, List } from "react-virtualized";
import "react-virtualized/styles.css";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Sample from "./Sample";
import tile from "./Samples.hooks";
import { render } from "enzyme";

class Samples extends Component {
  constructor(props, context) {
    super(props, context);

    this.containerRef = useRef(null);
    this.socket = getSocket(port, "state");
    this._list = [];
    this._loadMoreRowsStartIndex = null;
    this._loadMoreRowsStopIndex = null;

    this._isRowLoaded = this._isRowLoaded.bind(this);
    this._loadMoreRows = this._loadMoreRows.bind(this);
    this._updateCallback = this._updateCallback.bind(this);
    this._rowHeight = this._rowHeight.bind(this);
  }

  componentWillMount() {
    this.socket.on("update", this._updateCallback);
  }

  componentWillUnmount() {
    this.socket.off("update", this._updateCallback);
  }

  _isRowLoaded = ({ index }) => {
    return !!this._list[index];
  };

  _loadMoreRows(indexes) {
    return new Promise((resolve, reject) => {
      socket.emit("page", indexes, (data) => {
        return resolve(data);
      });
    });
  }

  _updateCallback() {
    this._loadMoreRows({
      startIndex: this._loadMoreRowsStartIndex,
      stopIndex: this._loadMoreRowsStopIndex,
    });
  }

  _rowHeight({ index }) {
    const sample = this._list[index];
    return 913 * sample.coefficient;
  }

  _rowRenderer({ key, index, style }) {
    return (
      <div key={key} style={style}>
        {index}
      </div>
    );
  }

  render() {
    const { displayProps, state, setView, port, classes } = this.props;

    return (
      <div
        className={classes}
        ref={this.containerRef}
        style={{ width: "100%", padding: "1% 0" }}
      >
        <InfiniteLoader
          isRowLoaded={this._isRowLoaded}
          loadMoreRows={this._loadMoreRows}
          rowCount={this.props.state.count}
        >
          {({ onRowsRendered, registerChild }) => (
            <List
              height={500}
              onRowsRendered={onRowsRendered}
              ref={registerChild}
              rowCount={this.props.state.rowCount}
              rowHeight={this._rowHeight}
              rowRenderer={this._rowRenderer}
              width={913}
            />
          )}
        </InfiniteLoader>
      </div>
    );
  }
}

export default connect(Samples);
