import _ from "lodash";
import React, { Component, createRef } from "react";
import { Dimmer, Loader } from "semantic-ui-react";
import {
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
  InfiniteLoader,
  List,
} from "react-virtualized";
import "react-virtualized/styles.css";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

class Samples extends Component {
  constructor(props) {
    super(props);

    this.containerRef = createRef();
    this.socket = getSocket(props.port, "state");
    this._loadMoreRowsStartIndex = null;
    this._loadMoreRowsStopIndex = null;

    this.isRowLoaded = this.isRowLoaded.bind(this);
    this.loadMoreRows = this.loadMoreRows.bind(this);
    this.updateCallback = this.updateCallback.bind(this);
    this.rowRenderer = this.rowRenderer.bind(this);

    this.socket.on("update", this.updateCallback);

    this.cache = new CellMeasurerCache({
      defaultHeight: 30,
      fixedWidth: true,
    });
    this._resizeAllFlag = false;
    this.state = {
      list: [],
      loading: false,
    };
  }

  componentWillUnmount() {
    this.socket.off("update", this.updateCallback);
  }

  loadMoreRows(indexes) {
    console.log(indexes, this.state.loading);
    if (this.state.loading) {
      return;
    }
    this.setState({
      loading: true,
    });
    return new Promise((resolve, reject) => {
      this.socket.emit("page", indexes, (data) => {
        this.setState({
          list: _.concat(this.state.list, data),
          loading: false,
        });
      });
    });
  }

  isRowLoaded({ index }) {
    return !!this.state.list[index];
  }

  updateCallback() {
    this._loadMoreRows({
      startIndex: this._loadMoreRowsStartIndex,
      stopIndex: this._loadMoreRowsStopIndex,
    });
  }

  rowRenderer({ key, index, isScrolling, isVisible, style }) {
    return (
      <CellMeasurer
        cache={this.cache}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div style={style}>asrhfshashaafh</div>
      </CellMeasurer>
    );
  }

  render() {
    if (this.state.list.length === 0) {
      return (
        <Dimmer active className="samples-dimmer" key={-1}>
          <Loader />
        </Dimmer>
      );
    } else {
      return (
        <InfiniteLoader
          isRowLoaded={this.isRowLoaded}
          loadMoreRows={this.loadMoreRows}
          rowCount={this.state.list.length}
          minimumBatchSize={10}
        >
          {({ onRowsRendered, registerChild }) => (
            <AutoSizer>
              {({ height, width }) => {
                this._registerList = registerChild;

                return (
                  <List
                    deferredMeasurementCache={this.cache}
                    height={height}
                    onRowsRendered={onRowsRendered}
                    overscanRowCount={1}
                    ref={this._setListRef}
                    rowCount={this.state.list.length}
                    rowHeight={this.cache.rowHeight}
                    rowRenderer={this.rowRenderer}
                    width={width}
                  />
                );
              }}
            </AutoSizer>
          )}
        </InfiniteLoader>
      );
    }
  }

  _resizeAll = () => {
    this._resizeAllFlag = false;
    this._cache.clearAll();
    if (this._list) {
      this._list.recomputeRowHeights();
    }
  };

  _setListRef = (ref) => {
    this._list = ref;
    this._registerList(ref);
  };
}

export default connect(Samples);
