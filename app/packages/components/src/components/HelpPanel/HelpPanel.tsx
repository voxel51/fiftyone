/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
  lookerPanelClose,
  lookerHelpPanelItems,
  lookerShortcutValue,
  lookerShortcutTitle,
  lookerShortcutDetail,
  lookerPanelFlex,
  lookerPanelHeader,
} from "./panel.module.css";
import { Close as CloseIcon } from "@fiftyone/components";
import { Fragment } from "react";

export default function HelpPanel({ containerRef, onClose, items }) {
  return (
    <div
      ref={containerRef}
      className={`${lookerPanelContainer}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={lookerPanelVerticalContainer}>
        <div className={lookerPanel}>
          <Scroll>
            <Header>Help</Header>
            <Items>
              {items.map((item, idx) => (
                <Item key={`{item.shortcut}-${idx}`} {...item} />
              ))}
            </Items>
          </Scroll>
          <CloseIcon
            className={lookerPanelClose}
            titleAccess="Close JSON"
            onClick={onClose}
            sx={{
              fontSize: "1.75rem",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Header({ children }) {
  return <div className={lookerPanelHeader}>{children}</div>;
}
function Scroll({ children }) {
  return <div className={lookerPanelFlex}>{children}</div>;
}
function Items({ children }) {
  return <div className={lookerHelpPanelItems}>{children}</div>;
}
function Item({ shortcut, title, detail }) {
  return (
    <Fragment>
      <div
        className={lookerShortcutValue}
        dangerouslySetInnerHTML={{ __html: shortcut }}
      />
      <div className={lookerShortcutTitle}>{title}</div>
      <div className={lookerShortcutDetail}>{detail}</div>
    </Fragment>
  );
}
