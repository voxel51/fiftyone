import React, { Component } from "react";
import PropTypes from "prop-types";

export default class InfiniteScroll extends Component {
  static propTypes = {
    children: PropTypes.node.isRequired,
    element: PropTypes.node,
    hasMore: PropTypes.bool,
    initialLoad: PropTypes.bool,
    isReverse: PropTypes.bool,
    loader: PropTypes.node,
    loadMore: PropTypes.func.isRequired,
    pageStart: PropTypes.number,
    ref: PropTypes.func,
    getScrollParent: PropTypes.func,
    threshold: PropTypes.number,
    useCapture: PropTypes.bool,
    useWindow: PropTypes.bool,
  };

  static defaultProps = {
    element: "div",
    hasMore: false,
    initialLoad: true,
    pageStart: 0,
    ref: null,
    threshold: 250,
    useWindow: true,
    isReverse: false,
    useCapture: false,
    loader: null,
    getScrollParent: null,
  };

  constructor(props) {
    super(props);

    this.scrollListener = this.scrollListener.bind(this);
    this.eventListenerOptions = this.eventListenerOptions.bind(this);
    this.mousewheelListener = this.mousewheelListener.bind(this);
  }

  componentDidMount() {
    this.pageLoaded = this.props.pageStart;
    this.options = this.eventListenerOptions();
    this.attachScrollListener();
  }

  componentDidUpdate() {
    if (this.props.isReverse && this.loadMore) {
      const parentElement = this.getParentElement(this.scrollComponent);
      parentElement.scrollTop =
        parentElement.scrollHeight -
        this.beforeScrollHeight +
        this.beforeScrollTop;
      this.loadMore = false;
    }
    this.attachScrollListener();
  }

  componentWillUnmount() {
    this.detachScrollListener();
    this.detachMousewheelListener();
  }

  isPassiveSupported() {
    let passive = false;

    const testOptions = {
      get passive() {
        passive = true;
      },
    };

    try {
      document.addEventListener("test", null, testOptions);
      document.removeEventListener("test", null, testOptions);
    } catch (e) {
      // ignore
    }
    return passive;
  }

  eventListenerOptions() {
    let options = this.props.useCapture;

    if (this.isPassiveSupported()) {
      options = {
        useCapture: this.props.useCapture,
        passive: true,
      };
    } else {
      options = {
        passive: false,
      };
    }
    return options;
  }

  // Set a defaut loader for all your `InfiniteScroll` components
  setDefaultLoader(loader) {
    this.defaultLoader = loader;
  }

  detachMousewheelListener() {
    let scrollEl = window;
    if (this.props.useWindow === false) {
      scrollEl = this.scrollComponent.parentNode;
    }

    scrollEl.removeEventListener(
      "mousewheel",
      this.mousewheelListener,
      this.options ? this.options : this.props.useCapture
    );
  }

  detachScrollListener() {
    let scrollEl = window;
    if (this.props.useWindow === false) {
      scrollEl = this.getParentElement(this.scrollComponent);
    }

    scrollEl.removeEventListener(
      "scroll",
      this.scrollListener,
      this.options ? this.options : this.props.useCapture
    );
    scrollEl.removeEventListener(
      "resize",
      this.scrollListener,
      this.options ? this.options : this.props.useCapture
    );
  }

  getParentElement(el) {
    const scrollParent =
      this.props.getScrollParent && this.props.getScrollParent();
    if (scrollParent != null) {
      return scrollParent;
    }
    return el && el.parentNode;
  }

  filterProps(props) {
    return props;
  }

  attachScrollListener() {
    const parentElement = this.getParentElement(this.scrollComponent);
    if (!this.props.hasMore || !parentElement) {
      return;
    }

    let scrollEl = window;
    if (this.props.useWindow === false) {
      scrollEl = parentElement;
    }

    scrollEl.addEventListener(
      "mousewheel",
      this.mousewheelListener,
      this.options ? this.options : this.props.useCapture
    );
    scrollEl.addEventListener(
      "scroll",
      this.scrollListener,
      this.options ? this.options : this.props.useCapture
    );
    scrollEl.addEventListener(
      "resize",
      this.scrollListener,
      this.options ? this.options : this.props.useCapture
    );

    if (this.props.initialLoad) {
      this.scrollListener();
    }
  }

  mousewheelListener(e) {
    // Prevents Chrome hangups
    // See: https://stackoverflow.com/questions/47524205/random-high-content-download-time-in-chrome/47684257#47684257
    if (e.deltaY === 1 && !this.isPassiveSupported()) {
      e.preventDefault();
    }
  }

  scrollListener() {
    const el = this.scrollComponent;
    const scrollEl = window;
    const parentNode = this.getParentElement(el);
    console.log("HEI", parentNode.offsetHeight);

    let offset;
    if (this.props.useWindow) {
      const doc =
        document.documentElement || document.body.parentNode || document.body;
      console.log("doc", doc, document.documentElement);
      const scrollTop =
        scrollEl.pageYOffset !== undefined
          ? scrollEl.pageYOffset
          : doc.scrollTop;
      if (this.props.isReverse) {
        offset = scrollTop;
      } else {
        offset = this.calculateOffset(el, scrollTop);
      }
    } else if (this.props.isReverse) {
      offset = parentNode.scrollTop;
    } else {
      console.log(el.attributes);
      console.log(
        el.offsetHeight,
        parentNode.scrollTop,
        parentNode.clientHeight
      );
      offset = el.offsetHeight - parentNode.scrollTop - parentNode.clientHeight;
    }

    // Here we make sure the element is visible as well as checking the offset
    console.log("checking");
    if (
      offset < Number(this.props.threshold) &&
      el &&
      el.offsetParent !== null
    ) {
      this.detachScrollListener();
      this.beforeScrollHeight = parentNode.scrollHeight;
      this.beforeScrollTop = parentNode.scrollTop;
      // Call loadMore after detachScrollListener to allow for non-async loadMore functions
      if (typeof this.props.loadMore === "function") {
        console.log("calling");
        this.props.loadMore((this.pageLoaded += 1));
        this.loadMore = true;
      }
    }
  }

  calculateOffset(el, scrollTop) {
    console.log(el, el.offsetTop, scrollTop);
    if (!el) {
      return 0;
    }

    const ee = this.calculateTopPosition(el);
    const rr = ee + (el.offsetHeight - scrollTop - window.innerHeight);
    console.log(
      "rr",
      rr,
      "ctp",
      ee,
      el.offsetHeight,
      scrollTop,
      window.innerHeight
    );
    return rr;
  }

  calculateTopPosition(el) {
    if (!el) {
      return 0;
    }
    return el.offsetTop + this.calculateTopPosition(el.offsetParent);
  }

  render() {
    const renderProps = this.filterProps(this.props);
    const {
      children,
      element,
      hasMore,
      initialLoad,
      isReverse,
      loader,
      loadMore,
      pageStart,
      ref,
      threshold,
      useCapture,
      useWindow,
      getScrollParent,
      ...props
    } = renderProps;

    props.ref = (node) => {
      this.scrollComponent = node;
      if (ref) {
        ref(node);
      }
    };

    const childrenArray = [children];
    if (hasMore) {
      if (loader) {
        isReverse ? childrenArray.unshift(loader) : childrenArray.push(loader);
      } else if (this.defaultLoader) {
        isReverse
          ? childrenArray.unshift(this.defaultLoader)
          : childrenArray.push(this.defaultLoader);
      }
    }
    return React.createElement(element, props, childrenArray);
  }
}
