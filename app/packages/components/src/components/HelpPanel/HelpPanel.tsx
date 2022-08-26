/**
 * Copyright 2017-2022, Voxel51, Inc.
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
import closeIcon from "../../icons/close.svg";
import { Fragment } from "react";

function Close({ onClick }) {
  return (
    <img
      src={closeIcon}
      className={lookerPanelClose}
      title="Close JSON"
      onClick={onClick}
    />
  );
}

export default function HelpPanel({ onClose, items }) {
  return (
    <div className={`${lookerPanelContainer}`}>
      <div className={lookerPanelVerticalContainer}>
        <div className={lookerPanel} onClick={(e) => e.stopPropagation()}>
          <Scroll>
            <Header>Help</Header>
            <Items>
              {items.map((item) => (
                <Item {...item} />
              ))}
            </Items>
          </Scroll>
          <Close onClick={onClose} />
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
      <div className={lookerShortcutValue}>{shortcut}</div>
      <div className={lookerShortcutTitle}>{title}</div>
      <div className={lookerShortcutDetail}>{detail}</div>
    </Fragment>
  );
}
