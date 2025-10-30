import { useTheme } from "@fiftyone/components";
import { InfoOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

const TipsContainer = styled.div<{
  $border: string;
  $text: string;
  $isMultiviewOn: boolean;
}>`
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(${(p) => (p.$isMultiviewOn ? "-100%" : "-50%")});
  opacity: 0.6;
  color: ${(p) => p.$text};
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 400;
  z-index: 1000;
  border: 1px solid ${(p) => p.$border};
  max-width: 500px;
  user-select: none;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
`;

const TipsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const TipsTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
`;

const TipsContent = styled.div`
  margin-bottom: 12px;
`;

const TipsList = styled.ul`
  margin: 0;
  padding-left: 16px;
  list-style-type: disc;
`;

const TipsListItem = styled.li`
  margin-bottom: 4px;
  color: #bdbdbd;
  list-style-type: none;
`;

const KeyboardShortcut = styled.span`
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  padding: 0px 6px;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  margin: 0 2px;
`;

const HighlightText = styled.span`
  color: #e0e0e0;
  font-weight: 500;
`;

const TipsActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const TipsButton = styled.button<{ $variant: "primary" | "secondary" }>`
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid
    ${(p) => (p.$variant === "primary" ? "#666" : "transparent")};
  background: ${(p) =>
    p.$variant === "primary" ? "rgba(255, 255, 255, 0.1)" : "transparent"};
  color: ${(p) => (p.$variant === "primary" ? "#e0e0e0" : "#999")};
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${(p) =>
      p.$variant === "primary"
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(255, 255, 255, 0.05)"};
    color: ${(p) => (p.$variant === "primary" ? "#fff" : "#ccc")};
  }
`;

const STORAGE_KEY = "fo-3d-annotation-tips-dismissed";

const annotationTips = [
  {
    text: (
      <>
        You can use <KeyboardShortcut>⌘ + 1, 2, 3, 4</KeyboardShortcut> to
        switch views at any time. For example, press{" "}
        <KeyboardShortcut>1</KeyboardShortcut> for{" "}
        <HighlightText>top view</HighlightText>,{" "}
        <KeyboardShortcut>⌘ + 1</KeyboardShortcut> for{" "}
        <HighlightText>bottom view</HighlightText>, or{" "}
        <KeyboardShortcut>4</KeyboardShortcut> for{" "}
        <HighlightText>annotation plane view</HighlightText>.
      </>
    ),
  },
];

export const AnnotationTips = ({
  isMultiviewOn,
}: {
  isMultiviewOn: boolean;
}) => {
  const theme = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleCancel = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleDoNotShowAgain = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
  }, []);

  // Rotate through tips every 5 seconds
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % annotationTips.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const currentTip = annotationTips[currentTipIndex];

  return (
    <TipsContainer
      $border={theme.primary.main}
      $text="#e0e0e0"
      $isMultiviewOn={isMultiviewOn}
    >
      <TipsHeader>
        <TipsTitle>
          <InfoOutlined style={{ fontSize: 16, color: theme.primary.main }} />
          FiftyOne 3D Viewer Tips
        </TipsTitle>
      </TipsHeader>

      <TipsContent>
        <TipsList>
          <TipsListItem>{currentTip.text}</TipsListItem>
        </TipsList>
      </TipsContent>

      <TipsActions>
        <TipsButton $variant="primary" onClick={handleCancel}>
          Got it
        </TipsButton>
        <TipsButton $variant="secondary" onClick={handleDoNotShowAgain}>
          Don't show again
        </TipsButton>
      </TipsActions>
    </TipsContainer>
  );
};
