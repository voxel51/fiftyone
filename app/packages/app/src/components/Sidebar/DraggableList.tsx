import React, { useRef, useState } from "react";
import { clamp } from "lodash";
import { useGesture } from "react-use-gesture";
import { useSprings, animated, interpolate } from "react-spring";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import Paper from "@material-ui/core/Paper";

const AnimatedListItem = animated(ListItem);

const fn = (
  order: number[],
  down?: boolean,
  originalIndex?: number,
  curIndex?: number,
  y?: number
) => (index: number) =>
  down && index === originalIndex
    ? {
        y: curIndex * 100 + y,
        scale: 1.1,
        zIndex: "2",
        shadow: 15,
        immediate: (n) => n === "y" || n === "zIndex",
      }
    : {
        y: order.indexOf(index) * 100,
        scale: 1,
        zIndex: "1",
        shadow: 1,
        immediate: false,
      };

type DraggableListProps = {
  items: string[];
  onChange: (items: string[]) => void;
};

const DraggableList = ({ items: inputItems, onChange }: DraggableListProps) => {
  const [items] = useState(inputItems);
  const order = useRef(items.map((_, index) => index)); // Store indicies as a local ref, this represents the item order

  const [springs, setSprings] = useSprings(items.length, fn(order.current)); // Create springs, each corresponds to an item, controlling its transform, scale, etc.
  const bind = useGesture(({ args: [originalIndex], down, delta: [, y] }) => {
    const curIndex = order.current.indexOf(originalIndex);
    const curRow = clamp(
      Math.round((curIndex * 100 + y) / 100),
      0,
      items.length - 1
    );
    const newOrder = swap(order.current, curIndex, curRow);
    setSprings(fn(newOrder, down, originalIndex, curIndex, y)); // Feed springs new style data, they'll animate the view without causing a single render
    if (!down) {
      order.current = newOrder;
      onChange(newOrder.map((i) => items[i]));
    }
  });
  return (
    <div className="content" style={{ height: items.length * 100 }}>
      {springs.map(({ zIndex, shadow, y, scale }, i) => (
        <AnimatedListItem
          {...bind(i)}
          key={i}
          className={items[i]}
          style={{
            zIndex,
            boxShadow: shadow.interpolate(
              (s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`
            ),
            transform: interpolate(
              [y, scale],
              (y, s) => `translate3d(0,${y}px,0) scale(${s})`
            ),
          }}
        >
          <ListItemText primary={items[i]} />
        </AnimatedListItem>
      ))}
    </div>
  );
};

export default DraggableList;
