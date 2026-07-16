import { SvgIcon, type SvgIconProps } from "@mui/material";
import {
  AccessTimeIcon,
  AccountTreeIcon,
  AddBoxIcon,
  AddIcon,
  AddLinkIcon,
  AltRouteIcon,
  AppsIcon,
  ArchiveIcon,
  ArchiveOutlinedIcon,
  ArrowBackIcon,
  ArrowCircleDownIcon,
  ArrowCircleLeftOutlinedIcon,
  ArrowDownwardIcon,
  ArrowDropDownIcon,
  ArrowDropUpIcon,
  ArrowForwardIosIcon,
  ArrowForwardIosSharpIcon,
  ArrowOutwardIcon,
  ArrowUpwardIcon,
  ArticleOutlinedIcon,
  AssignmentIcon,
  AssignmentOutlinedIcon,
  AutoAwesomeIcon,
  AutoAwesomeMosaicOutlinedIcon,
  AutorenewIcon,
  BarChartIcon,
  BoltIcon,
  BookmarkIcon,
  BrushIcon,
  BubbleChartIcon,
  CachedOutlinedIcon,
  CallMergeIcon,
  CallSplitIcon,
  CallSplitOutlinedIcon,
  CancelIcon,
  CancelOutlinedIcon,
  CasinoIcon,
  CenterFocusWeakIcon,
  ChatBubbleOutlineRoundedIcon,
  CheckBoxOutlineBlankIcon,
  CheckCircleIcon,
  CheckCircleOutlineIcon,
  CheckIcon,
  CheckOutlinedIcon,
  CheckboxIcon,
  ChecklistIcon,
  ChevronRightIcon,
  CircleIcon,
  CircleOutlinedIcon,
  ClearAllIcon,
  ClearIcon,
  ClearOutlinedIcon,
  CloseIcon,
  CloseOutlinedIcon,
  CloseRoundedIcon,
  CloseTwoToneIcon,
  CloudOutlinedIcon,
  CloudUploadIcon,
  CodeIcon,
  CodeOutlinedIcon,
  ColorLensIcon,
  ContentCopyIcon,
  ContentCopyOutlinedIcon,
  CopyAllOutlinedIcon,
  CorporateFareIcon,
  CrisisAlertOutlinedIcon,
  CropSquareIcon,
  DarkModeIcon,
  DataObjectIcon,
  DeleteIcon,
  DeleteOutlineIcon,
  DeleteOutlineOutlinedIcon,
  DeleteOutlinedIcon,
  DesktopWindowsOutlinedIcon,
  DisplaySettingsIcon,
  DoneIcon,
  DoneOutlinedIcon,
  DownloadOutlinedIcon,
  DragHandleIcon,
  DragIndicatorIcon,
  EditIcon,
  EditNoteIcon,
  EditOutlinedIcon,
  EmailOutlinedIcon,
  ErrorIcon,
  ErrorOutlineIcon,
  ErrorOutlineOutlinedIcon,
  ExpandLessIcon,
  ExpandMoreIcon,
  ExtensionIcon,
  FactCheckIcon,
  FeedbackIcon,
  FiberManualRecordIcon,
  FileCopyIcon,
  FileDownloadOutlinedIcon,
  FileUploadOutlinedIcon,
  FilterAltIcon,
  FilterAltOffIcon,
  FilterDramaIcon,
  FilterListIcon,
  FitScreenIcon,
  FlipToBackIcon,
  FolderIcon,
  FolderOffIcon,
  FolderOpenIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  GridOnIcon,
  GridViewIcon,
  GroupAddIcon,
  GroupAddOutlinedIcon,
  HelpIcon,
  HideImageIcon,
  HighlightAltIcon,
  HowToVoteIcon,
  HubIcon,
  HubOutlinedIcon,
  ImageAspectRatioIcon,
  ImageIcon,
  InfoIcon,
  InfoOutlinedIcon,
  InputIcon,
  InsertChartOutlinedIcon,
  InsertDriveFileIcon,
  Inventory2Icon,
  Inventory2OutlinedIcon,
  KeyboardArrowDownIcon,
  KeyboardArrowDownOutlinedIcon,
  KeyboardArrowLeftIcon,
  KeyboardArrowRightIcon,
  KeyboardArrowUpIcon,
  KeyboardArrowUpOutlinedIcon,
  KeyboardBackspaceIcon,
  KeyboardDoubleArrowLeftIcon,
  KeyboardDoubleArrowRightIcon,
  LabelImportantIcon,
  LabelOutlinedIcon,
  LaunchIcon,
  LayersIcon,
  LibraryAddIcon,
  LightModeIcon,
  LightbulbIcon,
  ListIcon,
  LocalOfferIcon,
  LocalOfferOutlinedIcon,
  LockIcon,
  LockOpenOutlinedIcon,
  LockOutlinedIcon,
  LogoutIcon,
  MailOutlineIcon,
  MapIcon,
  MoreHorizIcon,
  MoreVertIcon,
  NotificationsActiveIcon,
  OpenInNewIcon,
  OpenWithIcon,
  PaletteIcon,
  PercentIcon,
  PersonAddAltIcon,
  PersonAddOutlinedIcon,
  PhotoCameraIcon,
  PieChartOutlinedIcon,
  PlayArrowIcon,
  PolylineIcon,
  PsychologyIcon,
  QuestionMarkIcon,
  RectangleIcon,
  RefreshIcon,
  RemoveCircleOutlineIcon,
  RemoveIcon,
  ReplayIcon,
  ReportProblemIcon,
  RestartAltIcon,
  RestartAltOutlinedIcon,
  RocketLaunchIcon,
  RuleFolderIcon,
  RuleIcon,
  SaveIcon,
  SaveOutlinedIcon,
  ScatterPlotIcon,
  SchoolIcon,
  SearchIcon,
  SearchOutlinedIcon,
  SellIcon,
  SettingsBackupRestoreIcon,
  SettingsIcon,
  SettingsInputCompositeRoundedIcon,
  SettingsOutlinedIcon,
  SettingsSystemDaydreamOutlinedIcon,
  ShowChartOutlinedIcon,
  ShuffleIcon,
  SkipNextIcon,
  SmartToyIcon,
  SpeedIcon,
  SplitscreenIcon,
  StopCircleOutlinedIcon,
  StorageIcon,
  StraightenIcon,
  SubdirectoryArrowRightIcon,
  SubjectIcon,
  SupportOutlinedIcon,
  SyncIcon,
  TableChartOutlinedIcon,
  TextureIcon,
  ThreeSixtyIcon,
  TimelineIcon,
  TimelineOutlinedIcon,
  TimerIcon,
  TimerOffIcon,
  TrackChangesIcon,
  TuneIcon,
  UnarchiveOutlinedIcon,
  UndoIcon,
  UpgradeOutlinedIcon,
  VerticalAlignTopIcon,
  VideocamIcon,
  ViewComfyIcon,
  ViewInArIcon,
  VisibilityIcon,
  VisibilityOffIcon,
  VisibilityOffOutlinedIcon,
  VisibilityOutlinedIcon,
  WallpaperIcon,
  WarningAmberIcon,
  WarningIcon,
  WebhookIcon,
  WestIcon,
  WorkspacesIcon,
} from "@voxel51/voodo";
import React from "react";

/**
 * MUI `SvgIcon`-compatible icon components that render `@voxel51/voodo`
 * design-system glyphs.
 *
 * These are drop-in replacements for `@mui/icons-material` imports: they
 * accept the full `SvgIconProps` API (`sx`, `fontSize`, `color`, etc.) so
 * existing call sites keep working, while the heavy `@mui/icons-material`
 * package can be dropped.
 *
 * New code should prefer the voodo per-icon components directly:
 * `import { AddIcon } from "@voxel51/voodo"`.
 */
const createIcon = (Glyph: React.ElementType, name: string) => {
  const Component = React.forwardRef<SVGSVGElement, SvgIconProps>(
    (props, ref) => (
      <SvgIcon
        component={Glyph}
        inheritViewBox
        // parity with @mui/icons-material, whose createSvgIcon emits this
        data-testid={`${name}Icon`}
        ref={ref}
        {...props}
      />
    ),
  );
  Component.displayName = `Mui${name}Icon`;
  return Component;
};

// Glyphs not yet published in @voxel51/voodo; artwork from Google Material
// Icons (Apache License 2.0). TODO: move into the design system.
const OpenInFullGlyph: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z" />
  </svg>
);
const TextRotationAngleupGlyph: React.FC<React.SVGProps<SVGSVGElement>> = (
  props,
) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M4.49 4.21 3.43 5.27 7.85 16.4l1.48-1.48-.92-2.19 3.54-3.54 2.19.92 1.48-1.48zm3.09 6.8L5.36 6.14l4.87 2.23zm12.99-1.68h-4.24l1.41 1.41-8.84 8.84L10.32 21l8.84-8.84 1.41 1.41z" />
  </svg>
);

export const MuiAccessTimeIcon = /*#__PURE__*/ createIcon(
  AccessTimeIcon,
  "AccessTime",
);
export const MuiAccountTreeIcon = /*#__PURE__*/ createIcon(
  AccountTreeIcon,
  "AccountTree",
);
export const MuiAddIcon = /*#__PURE__*/ createIcon(AddIcon, "Add");
export const MuiAddBoxIcon = /*#__PURE__*/ createIcon(AddBoxIcon, "AddBox");
export const MuiAddLinkIcon = /*#__PURE__*/ createIcon(AddLinkIcon, "AddLink");
export const MuiAltRouteIcon = /*#__PURE__*/ createIcon(
  AltRouteIcon,
  "AltRoute",
);
export const MuiAppsIcon = /*#__PURE__*/ createIcon(AppsIcon, "Apps");
export const MuiArchiveIcon = /*#__PURE__*/ createIcon(ArchiveIcon, "Archive");
export const MuiArchiveOutlinedIcon = /*#__PURE__*/ createIcon(
  ArchiveOutlinedIcon,
  "ArchiveOutlined",
);
export const MuiArrowBackIcon = /*#__PURE__*/ createIcon(
  ArrowBackIcon,
  "ArrowBack",
);
export const MuiArrowCircleDownIcon = /*#__PURE__*/ createIcon(
  ArrowCircleDownIcon,
  "ArrowCircleDown",
);
export const MuiArrowCircleLeftOutlinedIcon = /*#__PURE__*/ createIcon(
  ArrowCircleLeftOutlinedIcon,
  "ArrowCircleLeftOutlined",
);
export const MuiArrowDownwardIcon = /*#__PURE__*/ createIcon(
  ArrowDownwardIcon,
  "ArrowDownward",
);
export const MuiArrowDropDownIcon = /*#__PURE__*/ createIcon(
  ArrowDropDownIcon,
  "ArrowDropDown",
);
export const MuiArrowDropUpIcon = /*#__PURE__*/ createIcon(
  ArrowDropUpIcon,
  "ArrowDropUp",
);
export const MuiArrowForwardIosIcon = /*#__PURE__*/ createIcon(
  ArrowForwardIosIcon,
  "ArrowForwardIos",
);
export const MuiArrowForwardIosSharpIcon = /*#__PURE__*/ createIcon(
  ArrowForwardIosSharpIcon,
  "ArrowForwardIosSharp",
);
export const MuiArrowOutwardIcon = /*#__PURE__*/ createIcon(
  ArrowOutwardIcon,
  "ArrowOutward",
);
export const MuiArrowUpwardIcon = /*#__PURE__*/ createIcon(
  ArrowUpwardIcon,
  "ArrowUpward",
);
export const MuiArticleOutlinedIcon = /*#__PURE__*/ createIcon(
  ArticleOutlinedIcon,
  "ArticleOutlined",
);
export const MuiAssignmentIcon = /*#__PURE__*/ createIcon(
  AssignmentIcon,
  "Assignment",
);
export const MuiAssignmentOutlinedIcon = /*#__PURE__*/ createIcon(
  AssignmentOutlinedIcon,
  "AssignmentOutlined",
);
export const MuiAutoAwesomeIcon = /*#__PURE__*/ createIcon(
  AutoAwesomeIcon,
  "AutoAwesome",
);
export const MuiAutoAwesomeMosaicOutlinedIcon = /*#__PURE__*/ createIcon(
  AutoAwesomeMosaicOutlinedIcon,
  "AutoAwesomeMosaicOutlined",
);
export const MuiAutorenewIcon = /*#__PURE__*/ createIcon(
  AutorenewIcon,
  "Autorenew",
);
export const MuiBarChartIcon = /*#__PURE__*/ createIcon(
  BarChartIcon,
  "BarChart",
);
export const MuiBoltIcon = /*#__PURE__*/ createIcon(BoltIcon, "Bolt");
export const MuiBookmarkIcon = /*#__PURE__*/ createIcon(
  BookmarkIcon,
  "Bookmark",
);
export const MuiBrushIcon = /*#__PURE__*/ createIcon(BrushIcon, "Brush");
export const MuiBubbleChartIcon = /*#__PURE__*/ createIcon(
  BubbleChartIcon,
  "BubbleChart",
);
export const MuiCachedOutlinedIcon = /*#__PURE__*/ createIcon(
  CachedOutlinedIcon,
  "CachedOutlined",
);
export const MuiCallMergeIcon = /*#__PURE__*/ createIcon(
  CallMergeIcon,
  "CallMerge",
);
export const MuiCallSplitIcon = /*#__PURE__*/ createIcon(
  CallSplitIcon,
  "CallSplit",
);
export const MuiCallSplitOutlinedIcon = /*#__PURE__*/ createIcon(
  CallSplitOutlinedIcon,
  "CallSplitOutlined",
);
export const MuiCancelIcon = /*#__PURE__*/ createIcon(CancelIcon, "Cancel");
export const MuiCancelOutlinedIcon = /*#__PURE__*/ createIcon(
  CancelOutlinedIcon,
  "CancelOutlined",
);
export const MuiCasinoIcon = /*#__PURE__*/ createIcon(CasinoIcon, "Casino");
export const MuiCenterFocusWeakIcon = /*#__PURE__*/ createIcon(
  CenterFocusWeakIcon,
  "CenterFocusWeak",
);
export const MuiChatBubbleOutlineRoundedIcon = /*#__PURE__*/ createIcon(
  ChatBubbleOutlineRoundedIcon,
  "ChatBubbleOutlineRounded",
);
export const MuiCheckIcon = /*#__PURE__*/ createIcon(CheckIcon, "Check");
export const MuiCheckBoxIcon = /*#__PURE__*/ createIcon(
  CheckboxIcon,
  "CheckBox",
);
export const MuiCheckBoxOutlineBlankIcon = /*#__PURE__*/ createIcon(
  CheckBoxOutlineBlankIcon,
  "CheckBoxOutlineBlank",
);
export const MuiCheckCircleIcon = /*#__PURE__*/ createIcon(
  CheckCircleIcon,
  "CheckCircle",
);
export const MuiCheckCircleOutlineIcon = /*#__PURE__*/ createIcon(
  CheckCircleOutlineIcon,
  "CheckCircleOutline",
);
export const MuiCheckOutlinedIcon = /*#__PURE__*/ createIcon(
  CheckOutlinedIcon,
  "CheckOutlined",
);
export const MuiChecklistIcon = /*#__PURE__*/ createIcon(
  ChecklistIcon,
  "Checklist",
);
export const MuiChevronRightIcon = /*#__PURE__*/ createIcon(
  ChevronRightIcon,
  "ChevronRight",
);
export const MuiCircleIcon = /*#__PURE__*/ createIcon(CircleIcon, "Circle");
export const MuiCircleOutlinedIcon = /*#__PURE__*/ createIcon(
  CircleOutlinedIcon,
  "CircleOutlined",
);
export const MuiClearIcon = /*#__PURE__*/ createIcon(ClearIcon, "Clear");
export const MuiClearAllIcon = /*#__PURE__*/ createIcon(
  ClearAllIcon,
  "ClearAll",
);
export const MuiClearOutlinedIcon = /*#__PURE__*/ createIcon(
  ClearOutlinedIcon,
  "ClearOutlined",
);
export const MuiCloseIcon = /*#__PURE__*/ createIcon(CloseIcon, "Close");
export const MuiCloseOutlinedIcon = /*#__PURE__*/ createIcon(
  CloseOutlinedIcon,
  "CloseOutlined",
);
export const MuiCloseRoundedIcon = /*#__PURE__*/ createIcon(
  CloseRoundedIcon,
  "CloseRounded",
);
export const MuiCloseTwoToneIcon = /*#__PURE__*/ createIcon(
  CloseTwoToneIcon,
  "CloseTwoTone",
);
export const MuiCloudOutlinedIcon = /*#__PURE__*/ createIcon(
  CloudOutlinedIcon,
  "CloudOutlined",
);
export const MuiCloudUploadIcon = /*#__PURE__*/ createIcon(
  CloudUploadIcon,
  "CloudUpload",
);
export const MuiCodeIcon = /*#__PURE__*/ createIcon(CodeIcon, "Code");
export const MuiCodeOutlinedIcon = /*#__PURE__*/ createIcon(
  CodeOutlinedIcon,
  "CodeOutlined",
);
export const MuiColorLensIcon = /*#__PURE__*/ createIcon(
  ColorLensIcon,
  "ColorLens",
);
export const MuiContentCopyIcon = /*#__PURE__*/ createIcon(
  ContentCopyIcon,
  "ContentCopy",
);
export const MuiContentCopyOutlinedIcon = /*#__PURE__*/ createIcon(
  ContentCopyOutlinedIcon,
  "ContentCopyOutlined",
);
export const MuiCopyAllOutlinedIcon = /*#__PURE__*/ createIcon(
  CopyAllOutlinedIcon,
  "CopyAllOutlined",
);
export const MuiCorporateFareIcon = /*#__PURE__*/ createIcon(
  CorporateFareIcon,
  "CorporateFare",
);
export const MuiCrisisAlertOutlinedIcon = /*#__PURE__*/ createIcon(
  CrisisAlertOutlinedIcon,
  "CrisisAlertOutlined",
);
export const MuiCropSquareIcon = /*#__PURE__*/ createIcon(
  CropSquareIcon,
  "CropSquare",
);
export const MuiDarkModeIcon = /*#__PURE__*/ createIcon(
  DarkModeIcon,
  "DarkMode",
);
export const MuiDataObjectIcon = /*#__PURE__*/ createIcon(
  DataObjectIcon,
  "DataObject",
);
export const MuiDeleteIcon = /*#__PURE__*/ createIcon(DeleteIcon, "Delete");
export const MuiDeleteOutlineIcon = /*#__PURE__*/ createIcon(
  DeleteOutlineIcon,
  "DeleteOutline",
);
export const MuiDeleteOutlineOutlinedIcon = /*#__PURE__*/ createIcon(
  DeleteOutlineOutlinedIcon,
  "DeleteOutlineOutlined",
);
export const MuiDeleteOutlinedIcon = /*#__PURE__*/ createIcon(
  DeleteOutlinedIcon,
  "DeleteOutlined",
);
export const MuiDesktopWindowsOutlinedIcon = /*#__PURE__*/ createIcon(
  DesktopWindowsOutlinedIcon,
  "DesktopWindowsOutlined",
);
export const MuiDisplaySettingsIcon = /*#__PURE__*/ createIcon(
  DisplaySettingsIcon,
  "DisplaySettings",
);
export const MuiDoneIcon = /*#__PURE__*/ createIcon(DoneIcon, "Done");
export const MuiDoneOutlinedIcon = /*#__PURE__*/ createIcon(
  DoneOutlinedIcon,
  "DoneOutlined",
);
export const MuiDownloadOutlinedIcon = /*#__PURE__*/ createIcon(
  DownloadOutlinedIcon,
  "DownloadOutlined",
);
export const MuiDragHandleIcon = /*#__PURE__*/ createIcon(
  DragHandleIcon,
  "DragHandle",
);
export const MuiDragIndicatorIcon = /*#__PURE__*/ createIcon(
  DragIndicatorIcon,
  "DragIndicator",
);
export const MuiEditIcon = /*#__PURE__*/ createIcon(EditIcon, "Edit");
export const MuiEditNoteIcon = /*#__PURE__*/ createIcon(
  EditNoteIcon,
  "EditNote",
);
export const MuiEditOutlinedIcon = /*#__PURE__*/ createIcon(
  EditOutlinedIcon,
  "EditOutlined",
);
export const MuiEmailOutlinedIcon = /*#__PURE__*/ createIcon(
  EmailOutlinedIcon,
  "EmailOutlined",
);
export const MuiErrorIcon = /*#__PURE__*/ createIcon(ErrorIcon, "Error");
export const MuiErrorOutlineIcon = /*#__PURE__*/ createIcon(
  ErrorOutlineIcon,
  "ErrorOutline",
);
export const MuiErrorOutlineOutlinedIcon = /*#__PURE__*/ createIcon(
  ErrorOutlineOutlinedIcon,
  "ErrorOutlineOutlined",
);
export const MuiExpandLessIcon = /*#__PURE__*/ createIcon(
  ExpandLessIcon,
  "ExpandLess",
);
export const MuiExpandMoreIcon = /*#__PURE__*/ createIcon(
  ExpandMoreIcon,
  "ExpandMore",
);
export const MuiExtensionIcon = /*#__PURE__*/ createIcon(
  ExtensionIcon,
  "Extension",
);
export const MuiFactCheckIcon = /*#__PURE__*/ createIcon(
  FactCheckIcon,
  "FactCheck",
);
export const MuiFeedbackIcon = /*#__PURE__*/ createIcon(
  FeedbackIcon,
  "Feedback",
);
export const MuiFiberManualRecordIcon = /*#__PURE__*/ createIcon(
  FiberManualRecordIcon,
  "FiberManualRecord",
);
export const MuiFileCopyIcon = /*#__PURE__*/ createIcon(
  FileCopyIcon,
  "FileCopy",
);
export const MuiFileDownloadOutlinedIcon = /*#__PURE__*/ createIcon(
  FileDownloadOutlinedIcon,
  "FileDownloadOutlined",
);
export const MuiFileUploadOutlinedIcon = /*#__PURE__*/ createIcon(
  FileUploadOutlinedIcon,
  "FileUploadOutlined",
);
export const MuiFilterAltIcon = /*#__PURE__*/ createIcon(
  FilterAltIcon,
  "FilterAlt",
);
export const MuiFilterAltOffIcon = /*#__PURE__*/ createIcon(
  FilterAltOffIcon,
  "FilterAltOff",
);
export const MuiFilterDramaIcon = /*#__PURE__*/ createIcon(
  FilterDramaIcon,
  "FilterDrama",
);
export const MuiFilterListIcon = /*#__PURE__*/ createIcon(
  FilterListIcon,
  "FilterList",
);
export const MuiFitScreenIcon = /*#__PURE__*/ createIcon(
  FitScreenIcon,
  "FitScreen",
);
export const MuiFlipToBackIcon = /*#__PURE__*/ createIcon(
  FlipToBackIcon,
  "FlipToBack",
);
export const MuiFolderIcon = /*#__PURE__*/ createIcon(FolderIcon, "Folder");
export const MuiFolderOffIcon = /*#__PURE__*/ createIcon(
  FolderOffIcon,
  "FolderOff",
);
export const MuiFolderOpenIcon = /*#__PURE__*/ createIcon(
  FolderOpenIcon,
  "FolderOpen",
);
export const MuiFullscreenIcon = /*#__PURE__*/ createIcon(
  FullscreenIcon,
  "Fullscreen",
);
export const MuiFullscreenExitIcon = /*#__PURE__*/ createIcon(
  FullscreenExitIcon,
  "FullscreenExit",
);
export const MuiGridOnIcon = /*#__PURE__*/ createIcon(GridOnIcon, "GridOn");
export const MuiGridViewIcon = /*#__PURE__*/ createIcon(
  GridViewIcon,
  "GridView",
);
export const MuiGroupAddIcon = /*#__PURE__*/ createIcon(
  GroupAddIcon,
  "GroupAdd",
);
export const MuiGroupAddOutlinedIcon = /*#__PURE__*/ createIcon(
  GroupAddOutlinedIcon,
  "GroupAddOutlined",
);
export const MuiHelpIcon = /*#__PURE__*/ createIcon(HelpIcon, "Help");
export const MuiHideImageIcon = /*#__PURE__*/ createIcon(
  HideImageIcon,
  "HideImage",
);
export const MuiHighlightAltIcon = /*#__PURE__*/ createIcon(
  HighlightAltIcon,
  "HighlightAlt",
);
export const MuiHowToVoteIcon = /*#__PURE__*/ createIcon(
  HowToVoteIcon,
  "HowToVote",
);
export const MuiHubIcon = /*#__PURE__*/ createIcon(HubIcon, "Hub");
export const MuiHubOutlinedIcon = /*#__PURE__*/ createIcon(
  HubOutlinedIcon,
  "HubOutlined",
);
export const MuiImageIcon = /*#__PURE__*/ createIcon(ImageIcon, "Image");
export const MuiImageAspectRatioIcon = /*#__PURE__*/ createIcon(
  ImageAspectRatioIcon,
  "ImageAspectRatio",
);
export const MuiInfoIcon = /*#__PURE__*/ createIcon(InfoIcon, "Info");
export const MuiInfoOutlinedIcon = /*#__PURE__*/ createIcon(
  InfoOutlinedIcon,
  "InfoOutlined",
);
export const MuiInputIcon = /*#__PURE__*/ createIcon(InputIcon, "Input");
export const MuiInsertChartOutlinedIcon = /*#__PURE__*/ createIcon(
  InsertChartOutlinedIcon,
  "InsertChartOutlined",
);
export const MuiInsertDriveFileIcon = /*#__PURE__*/ createIcon(
  InsertDriveFileIcon,
  "InsertDriveFile",
);
export const MuiInventory2Icon = /*#__PURE__*/ createIcon(
  Inventory2Icon,
  "Inventory2",
);
export const MuiInventory2OutlinedIcon = /*#__PURE__*/ createIcon(
  Inventory2OutlinedIcon,
  "Inventory2Outlined",
);
export const MuiKeyboardArrowDownIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowDownIcon,
  "KeyboardArrowDown",
);
export const MuiKeyboardArrowDownOutlinedIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowDownOutlinedIcon,
  "KeyboardArrowDownOutlined",
);
export const MuiKeyboardArrowLeftIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowLeftIcon,
  "KeyboardArrowLeft",
);
export const MuiKeyboardArrowRightIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowRightIcon,
  "KeyboardArrowRight",
);
export const MuiKeyboardArrowUpIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowUpIcon,
  "KeyboardArrowUp",
);
export const MuiKeyboardArrowUpOutlinedIcon = /*#__PURE__*/ createIcon(
  KeyboardArrowUpOutlinedIcon,
  "KeyboardArrowUpOutlined",
);
export const MuiKeyboardBackspaceIcon = /*#__PURE__*/ createIcon(
  KeyboardBackspaceIcon,
  "KeyboardBackspace",
);
export const MuiKeyboardDoubleArrowLeftIcon = /*#__PURE__*/ createIcon(
  KeyboardDoubleArrowLeftIcon,
  "KeyboardDoubleArrowLeft",
);
export const MuiKeyboardDoubleArrowRightIcon = /*#__PURE__*/ createIcon(
  KeyboardDoubleArrowRightIcon,
  "KeyboardDoubleArrowRight",
);
export const MuiLabelImportantIcon = /*#__PURE__*/ createIcon(
  LabelImportantIcon,
  "LabelImportant",
);
export const MuiLabelOutlinedIcon = /*#__PURE__*/ createIcon(
  LabelOutlinedIcon,
  "LabelOutlined",
);
export const MuiLaunchIcon = /*#__PURE__*/ createIcon(LaunchIcon, "Launch");
export const MuiLayersIcon = /*#__PURE__*/ createIcon(LayersIcon, "Layers");
export const MuiLibraryAddIcon = /*#__PURE__*/ createIcon(
  LibraryAddIcon,
  "LibraryAdd",
);
export const MuiLightModeIcon = /*#__PURE__*/ createIcon(
  LightModeIcon,
  "LightMode",
);
export const MuiLightbulbIcon = /*#__PURE__*/ createIcon(
  LightbulbIcon,
  "Lightbulb",
);
export const MuiListIcon = /*#__PURE__*/ createIcon(ListIcon, "List");
export const MuiLocalOfferIcon = /*#__PURE__*/ createIcon(
  LocalOfferIcon,
  "LocalOffer",
);
export const MuiLocalOfferOutlinedIcon = /*#__PURE__*/ createIcon(
  LocalOfferOutlinedIcon,
  "LocalOfferOutlined",
);
export const MuiLockIcon = /*#__PURE__*/ createIcon(LockIcon, "Lock");
export const MuiLockOpenOutlinedIcon = /*#__PURE__*/ createIcon(
  LockOpenOutlinedIcon,
  "LockOpenOutlined",
);
export const MuiLockOutlinedIcon = /*#__PURE__*/ createIcon(
  LockOutlinedIcon,
  "LockOutlined",
);
export const MuiLogoutIcon = /*#__PURE__*/ createIcon(LogoutIcon, "Logout");
export const MuiMailOutlineIcon = /*#__PURE__*/ createIcon(
  MailOutlineIcon,
  "MailOutline",
);
export const MuiMapIcon = /*#__PURE__*/ createIcon(MapIcon, "Map");
export const MuiMoreHorizIcon = /*#__PURE__*/ createIcon(
  MoreHorizIcon,
  "MoreHoriz",
);
export const MuiMoreVertIcon = /*#__PURE__*/ createIcon(
  MoreVertIcon,
  "MoreVert",
);
export const MuiNotificationsActiveIcon = /*#__PURE__*/ createIcon(
  NotificationsActiveIcon,
  "NotificationsActive",
);
export const MuiOpenInNewIcon = /*#__PURE__*/ createIcon(
  OpenInNewIcon,
  "OpenInNew",
);
export const MuiOpenWithIcon = /*#__PURE__*/ createIcon(
  OpenWithIcon,
  "OpenWith",
);
export const MuiPaletteIcon = /*#__PURE__*/ createIcon(PaletteIcon, "Palette");
export const MuiPercentIcon = /*#__PURE__*/ createIcon(PercentIcon, "Percent");
export const MuiPersonAddAltIcon = /*#__PURE__*/ createIcon(
  PersonAddAltIcon,
  "PersonAddAlt",
);
export const MuiPersonAddOutlinedIcon = /*#__PURE__*/ createIcon(
  PersonAddOutlinedIcon,
  "PersonAddOutlined",
);
export const MuiPhotoCameraIcon = /*#__PURE__*/ createIcon(
  PhotoCameraIcon,
  "PhotoCamera",
);
export const MuiPieChartOutlinedIcon = /*#__PURE__*/ createIcon(
  PieChartOutlinedIcon,
  "PieChartOutlined",
);
export const MuiPlayArrowIcon = /*#__PURE__*/ createIcon(
  PlayArrowIcon,
  "PlayArrow",
);
export const MuiPolylineIcon = /*#__PURE__*/ createIcon(
  PolylineIcon,
  "Polyline",
);
export const MuiPsychologyIcon = /*#__PURE__*/ createIcon(
  PsychologyIcon,
  "Psychology",
);
export const MuiQuestionMarkIcon = /*#__PURE__*/ createIcon(
  QuestionMarkIcon,
  "QuestionMark",
);
export const MuiRectangleIcon = /*#__PURE__*/ createIcon(
  RectangleIcon,
  "Rectangle",
);
export const MuiRefreshIcon = /*#__PURE__*/ createIcon(RefreshIcon, "Refresh");
export const MuiRemoveIcon = /*#__PURE__*/ createIcon(RemoveIcon, "Remove");
export const MuiRemoveCircleOutlineIcon = /*#__PURE__*/ createIcon(
  RemoveCircleOutlineIcon,
  "RemoveCircleOutline",
);
export const MuiReplayIcon = /*#__PURE__*/ createIcon(ReplayIcon, "Replay");
export const MuiReportProblemIcon = /*#__PURE__*/ createIcon(
  ReportProblemIcon,
  "ReportProblem",
);
export const MuiRestartAltIcon = /*#__PURE__*/ createIcon(
  RestartAltIcon,
  "RestartAlt",
);
export const MuiRestartAltOutlinedIcon = /*#__PURE__*/ createIcon(
  RestartAltOutlinedIcon,
  "RestartAltOutlined",
);
export const MuiRocketLaunchIcon = /*#__PURE__*/ createIcon(
  RocketLaunchIcon,
  "RocketLaunch",
);
export const MuiRuleIcon = /*#__PURE__*/ createIcon(RuleIcon, "Rule");
export const MuiRuleFolderIcon = /*#__PURE__*/ createIcon(
  RuleFolderIcon,
  "RuleFolder",
);
export const MuiSaveIcon = /*#__PURE__*/ createIcon(SaveIcon, "Save");
export const MuiSaveOutlinedIcon = /*#__PURE__*/ createIcon(
  SaveOutlinedIcon,
  "SaveOutlined",
);
export const MuiScatterPlotIcon = /*#__PURE__*/ createIcon(
  ScatterPlotIcon,
  "ScatterPlot",
);
export const MuiSchoolIcon = /*#__PURE__*/ createIcon(SchoolIcon, "School");
export const MuiSearchIcon = /*#__PURE__*/ createIcon(SearchIcon, "Search");
export const MuiSearchOutlinedIcon = /*#__PURE__*/ createIcon(
  SearchOutlinedIcon,
  "SearchOutlined",
);
export const MuiSellIcon = /*#__PURE__*/ createIcon(SellIcon, "Sell");
export const MuiSettingsIcon = /*#__PURE__*/ createIcon(
  SettingsIcon,
  "Settings",
);
export const MuiSettingsBackupRestoreIcon = /*#__PURE__*/ createIcon(
  SettingsBackupRestoreIcon,
  "SettingsBackupRestore",
);
export const MuiSettingsInputCompositeRoundedIcon = /*#__PURE__*/ createIcon(
  SettingsInputCompositeRoundedIcon,
  "SettingsInputCompositeRounded",
);
export const MuiSettingsOutlinedIcon = /*#__PURE__*/ createIcon(
  SettingsOutlinedIcon,
  "SettingsOutlined",
);
export const MuiSettingsSystemDaydreamOutlinedIcon = /*#__PURE__*/ createIcon(
  SettingsSystemDaydreamOutlinedIcon,
  "SettingsSystemDaydreamOutlined",
);
export const MuiShowChartOutlinedIcon = /*#__PURE__*/ createIcon(
  ShowChartOutlinedIcon,
  "ShowChartOutlined",
);
export const MuiShuffleIcon = /*#__PURE__*/ createIcon(ShuffleIcon, "Shuffle");
export const MuiSkipNextIcon = /*#__PURE__*/ createIcon(
  SkipNextIcon,
  "SkipNext",
);
export const MuiSmartToyIcon = /*#__PURE__*/ createIcon(
  SmartToyIcon,
  "SmartToy",
);
export const MuiSpeedIcon = /*#__PURE__*/ createIcon(SpeedIcon, "Speed");
export const MuiSplitscreenIcon = /*#__PURE__*/ createIcon(
  SplitscreenIcon,
  "Splitscreen",
);
export const MuiStopCircleOutlinedIcon = /*#__PURE__*/ createIcon(
  StopCircleOutlinedIcon,
  "StopCircleOutlined",
);
export const MuiStorageIcon = /*#__PURE__*/ createIcon(StorageIcon, "Storage");
export const MuiStraightenIcon = /*#__PURE__*/ createIcon(
  StraightenIcon,
  "Straighten",
);
export const MuiSubdirectoryArrowRightIcon = /*#__PURE__*/ createIcon(
  SubdirectoryArrowRightIcon,
  "SubdirectoryArrowRight",
);
export const MuiSubjectIcon = /*#__PURE__*/ createIcon(SubjectIcon, "Subject");
export const MuiSupportOutlinedIcon = /*#__PURE__*/ createIcon(
  SupportOutlinedIcon,
  "SupportOutlined",
);
export const MuiSyncIcon = /*#__PURE__*/ createIcon(SyncIcon, "Sync");
export const MuiTableChartOutlinedIcon = /*#__PURE__*/ createIcon(
  TableChartOutlinedIcon,
  "TableChartOutlined",
);
export const MuiTextureIcon = /*#__PURE__*/ createIcon(TextureIcon, "Texture");
export const MuiThreeSixtyIcon = /*#__PURE__*/ createIcon(
  ThreeSixtyIcon,
  "ThreeSixty",
);
export const MuiTimelineIcon = /*#__PURE__*/ createIcon(
  TimelineIcon,
  "Timeline",
);
export const MuiTimelineOutlinedIcon = /*#__PURE__*/ createIcon(
  TimelineOutlinedIcon,
  "TimelineOutlined",
);
export const MuiTimerIcon = /*#__PURE__*/ createIcon(TimerIcon, "Timer");
export const MuiTimerOffIcon = /*#__PURE__*/ createIcon(
  TimerOffIcon,
  "TimerOff",
);
export const MuiTrackChangesIcon = /*#__PURE__*/ createIcon(
  TrackChangesIcon,
  "TrackChanges",
);
export const MuiTuneIcon = /*#__PURE__*/ createIcon(TuneIcon, "Tune");
export const MuiUnarchiveOutlinedIcon = /*#__PURE__*/ createIcon(
  UnarchiveOutlinedIcon,
  "UnarchiveOutlined",
);
export const MuiUndoIcon = /*#__PURE__*/ createIcon(UndoIcon, "Undo");
export const MuiUpgradeOutlinedIcon = /*#__PURE__*/ createIcon(
  UpgradeOutlinedIcon,
  "UpgradeOutlined",
);
export const MuiVerticalAlignTopIcon = /*#__PURE__*/ createIcon(
  VerticalAlignTopIcon,
  "VerticalAlignTop",
);
export const MuiVideocamIcon = /*#__PURE__*/ createIcon(
  VideocamIcon,
  "Videocam",
);
export const MuiViewComfyIcon = /*#__PURE__*/ createIcon(
  ViewComfyIcon,
  "ViewComfy",
);
export const MuiViewInArIcon = /*#__PURE__*/ createIcon(
  ViewInArIcon,
  "ViewInAr",
);
export const MuiVisibilityIcon = /*#__PURE__*/ createIcon(
  VisibilityIcon,
  "Visibility",
);
export const MuiVisibilityOffIcon = /*#__PURE__*/ createIcon(
  VisibilityOffIcon,
  "VisibilityOff",
);
export const MuiVisibilityOffOutlinedIcon = /*#__PURE__*/ createIcon(
  VisibilityOffOutlinedIcon,
  "VisibilityOffOutlined",
);
export const MuiVisibilityOutlinedIcon = /*#__PURE__*/ createIcon(
  VisibilityOutlinedIcon,
  "VisibilityOutlined",
);
export const MuiWallpaperIcon = /*#__PURE__*/ createIcon(
  WallpaperIcon,
  "Wallpaper",
);
export const MuiWarningIcon = /*#__PURE__*/ createIcon(WarningIcon, "Warning");
export const MuiWarningAmberIcon = /*#__PURE__*/ createIcon(
  WarningAmberIcon,
  "WarningAmber",
);
export const MuiWebhookIcon = /*#__PURE__*/ createIcon(WebhookIcon, "Webhook");
export const MuiWestIcon = /*#__PURE__*/ createIcon(WestIcon, "West");
export const MuiWorkspacesIcon = /*#__PURE__*/ createIcon(
  WorkspacesIcon,
  "Workspaces",
);
export const MuiOpenInFullIcon = /*#__PURE__*/ createIcon(
  OpenInFullGlyph,
  "OpenInFull",
);
export const MuiTextRotationAngleupIcon = /*#__PURE__*/ createIcon(
  TextRotationAngleupGlyph,
  "TextRotationAngleup",
);
