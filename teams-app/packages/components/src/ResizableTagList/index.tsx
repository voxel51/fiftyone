import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Box, Chip, Tooltip } from '@mui/material';

interface ResizableTagListProps {
  tags: string[];
  subtractWidth?: number; // subtract from container width
  addWidth?: number; // add to the total tag length
  maxTagWidth?: number; // show ellipses after this width
  lengthFactor?: number; // tag length multiplier - fine-tune this
  height?: number; // height of the tag
}

const ResizableTagList = (props: ResizableTagListProps) => {
  const {
    tags,
    subtractWidth = 0,
    maxTagWidth = 100,
    lengthFactor = 10,
    addWidth = 20,
    height = 24
  } = props;

  const containerRef = useRef(null);
  const [parentWidth, setParentWidth] = useState(0);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);

  useEffect(() => {
    const containerCurrent = containerRef?.current;
    if (containerCurrent) {
      setParentWidth(containerCurrent?.offsetWidth);
    }
  }, []);

  const handleExpandRemainingTags = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setShowAllTags(true);
    },
    []
  );

  const disableOnClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  let visibleTags = [];
  const invisibleTags = [];
  let visibleTagsWidth = 0;
  let remainingTagCount = 0;

  const resizableTagList = useMemo(() => {
    if (!showAllTags) {
      if (!parentWidth) return null;

      const containerWidth = parentWidth - subtractWidth;

      tags.forEach((tag) => {
        const totalWidth =
          visibleTagsWidth +
          Math.min(tag?.length * lengthFactor + addWidth, maxTagWidth);
        if (totalWidth < containerWidth) {
          visibleTags.push(tag);
          visibleTagsWidth = totalWidth;
        } else {
          invisibleTags.push(tag);
          remainingTagCount += 1;
        }
      });
    } else {
      visibleTags = tags;
    }

    const res = visibleTags?.map((tag: string, index) => {
      return (
        <Box
          key={index}
          sx={{
            maxWidth: maxTagWidth,
            paddingLeft: 0.5,
            paddingTop: showAllTags ? '0.2rem' : 0
          }}
          onClick={disableOnClick}
        >
          <Chip title={tag} label={tag} sx={{ height }} />
        </Box>
      );
    });
    if (!!remainingTagCount) {
      const remainingTitle = `+${remainingTagCount.toLocaleString()}`;
      const tooltipTitle = invisibleTags?.map((tag) => <Box>{tag}</Box>);

      res.push(
        <Tooltip title={tooltipTitle} key="remianing-tags">
          <Box paddingLeft={1} onClick={handleExpandRemainingTags}>
            <Chip
              title={remainingTitle}
              label={remainingTitle}
              sx={{ height, cursor: 'pointer' }}
            />
          </Box>
        </Tooltip>
      );
    }
    return res;
  }, [tags, parentWidth, showAllTags]);

  const containerStyles = {
    display: 'flex',
    flexWrap: showAllTags ? 'wrap' : 'no-wrap'
  };

  return (
    <Box width="100%" ref={containerRef} sx={containerStyles}>
      {resizableTagList}
    </Box>
  );
};

export default ResizableTagList;
