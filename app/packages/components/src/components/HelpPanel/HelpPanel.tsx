/**
 * Copyright 2017-2026, Voxel51, Inc.
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
  lookerSectionHeader,
  lookerSectionHeaderFirst,
} from "./panel.module.css";
import { Close as CloseIcon } from "@fiftyone/components";
import React, { Fragment, useMemo } from "react";

export default function HelpPanel({ containerRef, onClose, items }) {
  const groupedItems = useMemo(() => {
    // Group items by key if keys exist
    const hasKeys = items.some((item) => item.key);

    // Check if all items have the same key (or no key)
    let allSameKey = true;
    let firstKey = null;
    if (hasKeys) {
      for (const item of items) {
        if (item.key) {
          if (firstKey === null) {
            firstKey = item.key;
          } else if (item.key !== firstKey) {
            allSameKey = false;
            break;
          }
        }
      }
    }

    let result = [];
    if (hasKeys && !allSameKey) {
      // Group by key
      const groups = {};
      items.forEach((item) => {
        const key = item.key || "general";
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
      });

      // Convert to flat array with section headers
      Object.entries(groups).forEach(([key, groupItems]) => {
        // Add section header
        result.push({ isSectionHeader: true, sectionKey: key });
        // Add items in this group
        result.push(...groupItems);
      });
    } else {
      // All items have same key or no keys - render normally
      result = items;
    }

    return result;
  }, [items]);

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
              {groupedItems.map((item, idx) => (
                <Item
                  key={
                    item.isSectionHeader
                      ? `section-${item.sectionKey}-${idx}`
                      : `{item.shortcut}-${idx}`
                  }
                  {...item}
                />
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
function Item({ shortcut, title, detail, isSectionHeader, sectionKey }) {
  if (isSectionHeader) {
    const sectionNames = {
      views: "Camera Views",
      general: "General",
    };
    const sectionName = sectionNames[sectionKey] || sectionKey;
    const isFirstSection = sectionKey === "views";
    return (
      <div
        className={`${lookerSectionHeader} ${
          isFirstSection ? lookerSectionHeaderFirst : ""
        }`}
      >
        {sectionName}
      </div>
    );
  }
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
