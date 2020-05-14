import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Grid,
  Image,
  Label,
  Header,
  Icon,
  Menu,
  Message,
  Segment,
  Sidebar,
  Divider,
} from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";

import Player51 from "../player51/build/cjs/player51.min.js";

import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function chunkArray(array, size) {
  let result = [];
  for (let i = 0; i < array.length; i += size) {
    let chunk = array.slice(i, i + size);
    result.push(chunk);
  }
  return result;
}

const noop = () => {};

const delay = (n) => new Promise((resolve) => setTimeout(resolve, n));

const cancellablePromise = (promise) => {
  let isCanceled = false;

  const wrappedPromise = new Promise((resolve, reject) => {
    promise.then(
      (value) => (isCanceled ? reject({ isCanceled, value }) : resolve(value)),
      (error) => reject({ isCanceled, error })
    );
  });

  return {
    promise: wrappedPromise,
    cancel: () => (isCanceled = true),
  };
};

const useCancellablePromises = () => {
  const pendingPromises = useRef([]);

  const appendPendingPromise = (promise) =>
    (pendingPromises.current = [...pendingPromises.current, promise]);

  const removePendingPromise = (promise) =>
    (pendingPromises.current = pendingPromises.current.filter(
      (p) => p !== promise
    ));

  const clearPendingPromises = () =>
    pendingPromises.current.map((p) => p.cancel());

  const api = {
    appendPendingPromise,
    removePendingPromise,
    clearPendingPromises,
  };

  return api;
};

const useClickPreventionOnDoubleClick = (onClick, onDoubleClick) => {
  const api = useCancellablePromises();

  const handleClick = () => {
    api.clearPendingPromises();
    const waitForClick = cancellablePromise(delay(300));
    api.appendPendingPromise(waitForClick);

    return waitForClick.promise
      .then(() => {
        api.removePendingPromise(waitForClick);
        onClick();
      })
      .catch((errorInfo) => {
        api.removePendingPromise(waitForClick);
        if (!errorInfo.isCanceled) {
          throw errorInfo.error;
        }
      });
  };

  const handleDoubleClick = () => {
    api.clearPendingPromises();
    onDoubleClick();
  };

  return [handleClick, handleDoubleClick];
};

const Sample = connect(
  ({ dispatch, sample, port, setSelected, selected, setView }) => {
    const host = `http://127.0.0.1:${port}`;
    const src = `${host}?path=${sample.filepath}`;
    const socket = getSocket(port, "state");
    const id = sample._id.$oid;

    const handleClick = () => {
      const newSelected = { ...selected };
      const event = newSelected[id] ? "remove_selection" : "add_selection";
      newSelected[id] = newSelected[id] ? false : true;
      setSelected(newSelected);
      socket.emit(event, id, (data) => {
        dispatch(updateState(data));
      });
    };

    return (
      <SpecialImage
        src={src}
        style={{
          width: "100%",
          position: "relative",
          border: selected[id] ? "1px solid black" : "none",
        }}
        sample={sample}
        onClick={() => handleClick()}
        onDoubleClick={() => setView({ visible: true, sample })}
      />
    );
  }
);

const loadOverlay = (labels) => {
  const objects = [];
  for (const i in labels) {
    const label = labels[i];
    for (const j in label.detections) {
      const detection = label.detections[j];
      const bb = detection.bounding_box;
      objects.push({
        label: detection.label,
        bounding_box: {
          top_left: { x: bb[0], y: bb[1] },
          bottom_right: { x: bb[0] + bb[2], y: bb[1] + bb[3] },
        },
      });
    }
  }
  return { objects: { objects: objects } };
};

const SpecialImage = (props) => {
  const { onClick, onDoubleClick, src, style, sample } = props;
  const [player, setPlayer] = useState(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [handleClick, handleDoubleClick] = useClickPreventionOnDoubleClick(
    onClick,
    onDoubleClick
  );
  const overlay = loadOverlay(sample.labels);
  const loadPlayer = () => {
    let player;
    player = new Player51(
      {
        media: {
          src,
          type: "image/jpg",
        },
      },
      overlay
    );
    player.thumbnailMode();
    setPlayer(player);
    player.render(document.getElementById(`${src}`));
    if (player.renderer.eleImage) {
      player.renderer.eleImage.addEventListener("load", function () {
        setIsLoading(false);
      });
    }
  };

  useEffect(() => {
    loadPlayer();
  }, []);
  return (
    <div
      id={src}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    />
  );
};

function SampleList(props) {
  const { state, setView, port, dispatch } = props;
  const hasDataset = Boolean(state && state.dataset);
  const socket = getSocket(port, "state");
  const [selected, setSelected] = useState({});
  const [scrollState, setScrollState] = useState({
    initialLoad: true,
    hasMore: true,
    images: [],
    pageToLoad: 1,
  });
  const loadMore = () => {
    if (hasDataset) {
      socket.emit("page", scrollState.pageToLoad, (data) => {
        setScrollState({
          initialLoad: false,
          hasMore: scrollState.pageToLoad * 20 < state.count,
          images: [...scrollState.images, ...data],
          pageToLoad: scrollState.pageToLoad + 1,
        });
      });
    } else {
      setScrollState({
        initialLoad: true,
        hasMore: false,
        images: [],
        pageToLoad: 1,
      });
    }
  };

  useSubscribe(socket, "update", (data) => {
    setScrollState({
      iniitialLoad: true,
      hasMore: true,
      images: [],
      pageToLoad: 1,
    });
  });

  if (!hasDataset) {
    return (
      <Segment>
        <Message>No dataset loaded</Message>
      </Segment>
    );
  }

  const chunkedImages = chunkArray(scrollState.images, 4);
  const content = chunkedImages.map((imgs) => {
    return (
      <Grid.Row style={{ padding: "0.25rem 0" }}>
        {imgs.map((img) => {
          return (
            <Grid.Column style={{ padding: "0 0.25rem" }}>
              <Sample
                sample={img}
                selected={selected}
                setSelected={setSelected}
                setView={setView}
              />
            </Grid.Column>
          );
        })}
      </Grid.Row>
    );
  });

  return (
    <>
      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() => loadMore()}
        hasMore={scrollState.hasMore}
        loader={<Loader />}
        useWindow={true}
      >
        <Grid columns={4} style={{ margin: "-0.25rem" }}>
          {content}
        </Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(SampleList);
