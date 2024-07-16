import { datasetSampleCount } from "@fiftyone/state";
import { animated, useSpring } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { gridPage, showGridPixels } from "./recoil";
import { PAGE_SIZE } from "./useSpotlightPager";

const Drag = styled(animated.div)`
  width: 100%;
  background: ${({ theme }) => theme.primary.plainColor};
  height: 4px;
  position: absolute;
  right: 0;
  cursor: pointer;
  box-shadow: rgb(26, 26, 26) 0px 2px 20px;
  border-radius: 3px 0 0 3px;
  cursor: row-resize;
  width: 30px;

  &:hover {
    width: 40px;
    height: 6px;
    margin-top: -1px;
  }

  transition-property: margin-top, height, width;
  transition-duration: 0.25s;
  transition-timing-function: ease-in-out;
`;

const OFFSET = 48;

const calc = (page: number, count: number) => (page * PAGE_SIZE) / count;

const calcY = (page: number, count: number, height: number) =>
  calc(page, count) * (height - OFFSET) + OFFSET;

const Bar = ({ height }) => {
  const [page, setPage] = useRecoilState(gridPage);
  const count = useRecoilValue(datasetSampleCount);

  const [{ y }, api] = useSpring(() => ({
    y: calcY(page, count, height),
  }));

  if (page * 20 >= count) {
    throw new Error("WRONG");
  }

  const setDragging = useSetRecoilState(showGridPixels);

  const bind = useDrag(({ down, movement: [_, my] }) => {
    setDragging(down && my !== 0);

    const base = calcY(page, count, height);
    api.start({
      y: (down ? my : 0) + base,
      immediate: down,
    });

    !down &&
      setPage(
        Math.floor(
          (((base - OFFSET + my) / (height - OFFSET)) * count) / PAGE_SIZE
        )
      );
  });

  useEffect(() => {
    api.start({ y: calcY(page, count, height) });
  }, [api, count, page, height]);

  return <Drag {...bind()} style={{ top: y, right: 0 }} />;
};

export default Bar;
