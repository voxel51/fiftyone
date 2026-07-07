import { SvgIcon, type SvgIconProps } from "@mui/material";
import { IconName, iconMap } from "@voxel51/voodo";
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
 * New code should prefer the voodo `Icon` component directly:
 * `import { Icon, IconName } from "@voxel51/voodo"`.
 */
const createIcon = (name: Exclude<IconName, IconName.Spinner>) => {
  const Component = React.forwardRef<SVGSVGElement, SvgIconProps>(
    (props, ref) => (
      <SvgIcon
        component={iconMap[name]}
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

export const MuiAccessTimeIcon = createIcon(IconName.AccessTime);
export const MuiAccountTreeIcon = createIcon(IconName.AccountTree);
export const MuiAddIcon = createIcon(IconName.Add);
export const MuiAddBoxIcon = createIcon(IconName.AddBox);
export const MuiAddLinkIcon = createIcon(IconName.AddLink);
export const MuiAltRouteIcon = createIcon(IconName.AltRoute);
export const MuiAppsIcon = createIcon(IconName.Apps);
export const MuiArchiveIcon = createIcon(IconName.Archive);
export const MuiArchiveOutlinedIcon = createIcon(IconName.ArchiveOutlined);
export const MuiArrowBackIcon = createIcon(IconName.ArrowBack);
export const MuiArrowCircleDownIcon = createIcon(IconName.ArrowCircleDown);
export const MuiArrowCircleLeftOutlinedIcon = createIcon(
  IconName.ArrowCircleLeftOutlined,
);
export const MuiArrowDownwardIcon = createIcon(IconName.ArrowDownward);
export const MuiArrowDropDownIcon = createIcon(IconName.ArrowDropDown);
export const MuiArrowDropUpIcon = createIcon(IconName.ArrowDropUp);
export const MuiArrowForwardIosIcon = createIcon(IconName.ArrowForwardIos);
export const MuiArrowForwardIosSharpIcon = createIcon(
  IconName.ArrowForwardIosSharp,
);
export const MuiArrowOutwardIcon = createIcon(IconName.ArrowOutward);
export const MuiArrowUpwardIcon = createIcon(IconName.ArrowUpward);
export const MuiArticleOutlinedIcon = createIcon(IconName.ArticleOutlined);
export const MuiAssignmentIcon = createIcon(IconName.Assignment);
export const MuiAssignmentOutlinedIcon = createIcon(
  IconName.AssignmentOutlined,
);
export const MuiAutoAwesomeIcon = createIcon(IconName.AutoAwesome);
export const MuiAutoAwesomeMosaicOutlinedIcon = createIcon(
  IconName.AutoAwesomeMosaicOutlined,
);
export const MuiAutorenewIcon = createIcon(IconName.Autorenew);
export const MuiBarChartIcon = createIcon(IconName.BarChart);
export const MuiBoltIcon = createIcon(IconName.Bolt);
export const MuiBookmarkIcon = createIcon(IconName.Bookmark);
export const MuiBrushIcon = createIcon(IconName.Brush);
export const MuiBubbleChartIcon = createIcon(IconName.BubbleChart);
export const MuiCachedOutlinedIcon = createIcon(IconName.CachedOutlined);
export const MuiCallMergeIcon = createIcon(IconName.CallMerge);
export const MuiCallSplitIcon = createIcon(IconName.CallSplit);
export const MuiCallSplitOutlinedIcon = createIcon(IconName.CallSplitOutlined);
export const MuiCancelIcon = createIcon(IconName.Cancel);
export const MuiCancelOutlinedIcon = createIcon(IconName.CancelOutlined);
export const MuiCasinoIcon = createIcon(IconName.Casino);
export const MuiCenterFocusWeakIcon = createIcon(IconName.CenterFocusWeak);
export const MuiChatBubbleOutlineRoundedIcon = createIcon(
  IconName.ChatBubbleOutlineRounded,
);
export const MuiCheckIcon = createIcon(IconName.Check);
export const MuiCheckBoxIcon = createIcon(IconName.Checkbox);
export const MuiCheckBoxOutlineBlankIcon = createIcon(
  IconName.CheckBoxOutlineBlank,
);
export const MuiCheckCircleIcon = createIcon(IconName.CheckCircle);
export const MuiCheckCircleOutlineIcon = createIcon(
  IconName.CheckCircleOutline,
);
export const MuiCheckOutlinedIcon = createIcon(IconName.CheckOutlined);
export const MuiChecklistIcon = createIcon(IconName.Checklist);
export const MuiChevronRightIcon = createIcon(IconName.ChevronRight);
export const MuiCircleIcon = createIcon(IconName.Circle);
export const MuiCircleOutlinedIcon = createIcon(IconName.CircleOutlined);
export const MuiClearIcon = createIcon(IconName.Clear);
export const MuiClearAllIcon = createIcon(IconName.ClearAll);
export const MuiClearOutlinedIcon = createIcon(IconName.ClearOutlined);
export const MuiCloseIcon = createIcon(IconName.Close);
export const MuiCloseOutlinedIcon = createIcon(IconName.CloseOutlined);
export const MuiCloseRoundedIcon = createIcon(IconName.CloseRounded);
export const MuiCloseTwoToneIcon = createIcon(IconName.CloseTwoTone);
export const MuiCloudOutlinedIcon = createIcon(IconName.CloudOutlined);
export const MuiCloudUploadIcon = createIcon(IconName.CloudUpload);
export const MuiCodeIcon = createIcon(IconName.Code);
export const MuiCodeOutlinedIcon = createIcon(IconName.CodeOutlined);
export const MuiColorLensIcon = createIcon(IconName.ColorLens);
export const MuiContentCopyIcon = createIcon(IconName.ContentCopy);
export const MuiContentCopyOutlinedIcon = createIcon(
  IconName.ContentCopyOutlined,
);
export const MuiCopyAllOutlinedIcon = createIcon(IconName.CopyAllOutlined);
export const MuiCorporateFareIcon = createIcon(IconName.CorporateFare);
export const MuiCrisisAlertOutlinedIcon = createIcon(
  IconName.CrisisAlertOutlined,
);
export const MuiCropSquareIcon = createIcon(IconName.CropSquare);
export const MuiDarkModeIcon = createIcon(IconName.DarkMode);
export const MuiDataObjectIcon = createIcon(IconName.DataObject);
export const MuiDeleteIcon = createIcon(IconName.Delete);
export const MuiDeleteOutlineIcon = createIcon(IconName.DeleteOutline);
export const MuiDeleteOutlineOutlinedIcon = createIcon(
  IconName.DeleteOutlineOutlined,
);
export const MuiDeleteOutlinedIcon = createIcon(IconName.DeleteOutlined);
export const MuiDesktopWindowsOutlinedIcon = createIcon(
  IconName.DesktopWindowsOutlined,
);
export const MuiDisplaySettingsIcon = createIcon(IconName.DisplaySettings);
export const MuiDoneIcon = createIcon(IconName.Done);
export const MuiDoneOutlinedIcon = createIcon(IconName.DoneOutlined);
export const MuiDownloadOutlinedIcon = createIcon(IconName.DownloadOutlined);
export const MuiDragHandleIcon = createIcon(IconName.DragHandle);
export const MuiDragIndicatorIcon = createIcon(IconName.DragIndicator);
export const MuiEditIcon = createIcon(IconName.Edit);
export const MuiEditNoteIcon = createIcon(IconName.EditNote);
export const MuiEditOutlinedIcon = createIcon(IconName.EditOutlined);
export const MuiEmailOutlinedIcon = createIcon(IconName.EmailOutlined);
export const MuiErrorIcon = createIcon(IconName.Error);
export const MuiErrorOutlineIcon = createIcon(IconName.ErrorOutline);
export const MuiErrorOutlineOutlinedIcon = createIcon(
  IconName.ErrorOutlineOutlined,
);
export const MuiExpandLessIcon = createIcon(IconName.ExpandLess);
export const MuiExpandMoreIcon = createIcon(IconName.ExpandMore);
export const MuiExtensionIcon = createIcon(IconName.Extension);
export const MuiFactCheckIcon = createIcon(IconName.FactCheck);
export const MuiFeedbackIcon = createIcon(IconName.Feedback);
export const MuiFiberManualRecordIcon = createIcon(IconName.FiberManualRecord);
export const MuiFileCopyIcon = createIcon(IconName.FileCopy);
export const MuiFileDownloadOutlinedIcon = createIcon(
  IconName.FileDownloadOutlined,
);
export const MuiFileUploadOutlinedIcon = createIcon(
  IconName.FileUploadOutlined,
);
export const MuiFilterAltIcon = createIcon(IconName.FilterAlt);
export const MuiFilterAltOffIcon = createIcon(IconName.FilterAltOff);
export const MuiFilterDramaIcon = createIcon(IconName.FilterDrama);
export const MuiFilterListIcon = createIcon(IconName.FilterList);
export const MuiFitScreenIcon = createIcon(IconName.FitScreen);
export const MuiFlipToBackIcon = createIcon(IconName.FlipToBack);
export const MuiFolderIcon = createIcon(IconName.Folder);
export const MuiFolderOffIcon = createIcon(IconName.FolderOff);
export const MuiFolderOpenIcon = createIcon(IconName.FolderOpen);
export const MuiFullscreenIcon = createIcon(IconName.Fullscreen);
export const MuiFullscreenExitIcon = createIcon(IconName.FullscreenExit);
export const MuiGridOnIcon = createIcon(IconName.GridOn);
export const MuiGridViewIcon = createIcon(IconName.GridView);
export const MuiGroupAddIcon = createIcon(IconName.GroupAdd);
export const MuiGroupAddOutlinedIcon = createIcon(IconName.GroupAddOutlined);
export const MuiHelpIcon = createIcon(IconName.Help);
export const MuiHideImageIcon = createIcon(IconName.HideImage);
export const MuiHighlightAltIcon = createIcon(IconName.HighlightAlt);
export const MuiHowToVoteIcon = createIcon(IconName.HowToVote);
export const MuiHubIcon = createIcon(IconName.Hub);
export const MuiHubOutlinedIcon = createIcon(IconName.HubOutlined);
export const MuiImageIcon = createIcon(IconName.Image);
export const MuiImageAspectRatioIcon = createIcon(IconName.ImageAspectRatio);
export const MuiInfoIcon = createIcon(IconName.Info);
export const MuiInfoOutlinedIcon = createIcon(IconName.InfoOutlined);
export const MuiInputIcon = createIcon(IconName.Input);
export const MuiInsertChartOutlinedIcon = createIcon(
  IconName.InsertChartOutlined,
);
export const MuiInsertDriveFileIcon = createIcon(IconName.InsertDriveFile);
export const MuiInventory2Icon = createIcon(IconName.Inventory2);
export const MuiInventory2OutlinedIcon = createIcon(
  IconName.Inventory2Outlined,
);
export const MuiKeyboardArrowDownIcon = createIcon(IconName.KeyboardArrowDown);
export const MuiKeyboardArrowDownOutlinedIcon = createIcon(
  IconName.KeyboardArrowDownOutlined,
);
export const MuiKeyboardArrowLeftIcon = createIcon(IconName.KeyboardArrowLeft);
export const MuiKeyboardArrowRightIcon = createIcon(
  IconName.KeyboardArrowRight,
);
export const MuiKeyboardArrowUpIcon = createIcon(IconName.KeyboardArrowUp);
export const MuiKeyboardArrowUpOutlinedIcon = createIcon(
  IconName.KeyboardArrowUpOutlined,
);
export const MuiKeyboardBackspaceIcon = createIcon(IconName.KeyboardBackspace);
export const MuiKeyboardDoubleArrowLeftIcon = createIcon(
  IconName.KeyboardDoubleArrowLeft,
);
export const MuiKeyboardDoubleArrowRightIcon = createIcon(
  IconName.KeyboardDoubleArrowRight,
);
export const MuiLabelImportantIcon = createIcon(IconName.LabelImportant);
export const MuiLabelOutlinedIcon = createIcon(IconName.LabelOutlined);
export const MuiLaunchIcon = createIcon(IconName.Launch);
export const MuiLayersIcon = createIcon(IconName.Layers);
export const MuiLibraryAddIcon = createIcon(IconName.LibraryAdd);
export const MuiLightModeIcon = createIcon(IconName.LightMode);
export const MuiLightbulbIcon = createIcon(IconName.Lightbulb);
export const MuiListIcon = createIcon(IconName.List);
export const MuiLocalOfferIcon = createIcon(IconName.LocalOffer);
export const MuiLocalOfferOutlinedIcon = createIcon(
  IconName.LocalOfferOutlined,
);
export const MuiLockIcon = createIcon(IconName.Lock);
export const MuiLockOpenOutlinedIcon = createIcon(IconName.LockOpenOutlined);
export const MuiLockOutlinedIcon = createIcon(IconName.LockOutlined);
export const MuiLogoutIcon = createIcon(IconName.Logout);
export const MuiMailOutlineIcon = createIcon(IconName.MailOutline);
export const MuiMapIcon = createIcon(IconName.Map);
export const MuiMoreHorizIcon = createIcon(IconName.MoreHoriz);
export const MuiMoreVertIcon = createIcon(IconName.MoreVert);
export const MuiNotificationsActiveIcon = createIcon(
  IconName.NotificationsActive,
);
export const MuiOpenInNewIcon = createIcon(IconName.OpenInNew);
export const MuiOpenWithIcon = createIcon(IconName.OpenWith);
export const MuiPaletteIcon = createIcon(IconName.Palette);
export const MuiPercentIcon = createIcon(IconName.Percent);
export const MuiPersonAddAltIcon = createIcon(IconName.PersonAddAlt);
export const MuiPersonAddOutlinedIcon = createIcon(IconName.PersonAddOutlined);
export const MuiPhotoCameraIcon = createIcon(IconName.PhotoCamera);
export const MuiPieChartOutlinedIcon = createIcon(IconName.PieChartOutlined);
export const MuiPlayArrowIcon = createIcon(IconName.PlayArrow);
export const MuiPolylineIcon = createIcon(IconName.Polyline);
export const MuiPsychologyIcon = createIcon(IconName.Psychology);
export const MuiQuestionMarkIcon = createIcon(IconName.QuestionMark);
export const MuiRectangleIcon = createIcon(IconName.Rectangle);
export const MuiRefreshIcon = createIcon(IconName.Refresh);
export const MuiRemoveIcon = createIcon(IconName.Remove);
export const MuiRemoveCircleOutlineIcon = createIcon(
  IconName.RemoveCircleOutline,
);
export const MuiReplayIcon = createIcon(IconName.Replay);
export const MuiReportProblemIcon = createIcon(IconName.ReportProblem);
export const MuiRestartAltIcon = createIcon(IconName.RestartAlt);
export const MuiRestartAltOutlinedIcon = createIcon(
  IconName.RestartAltOutlined,
);
export const MuiRocketLaunchIcon = createIcon(IconName.RocketLaunch);
export const MuiRuleIcon = createIcon(IconName.Rule);
export const MuiRuleFolderIcon = createIcon(IconName.RuleFolder);
export const MuiSaveIcon = createIcon(IconName.Save);
export const MuiSaveOutlinedIcon = createIcon(IconName.SaveOutlined);
export const MuiScatterPlotIcon = createIcon(IconName.ScatterPlot);
export const MuiSchoolIcon = createIcon(IconName.School);
export const MuiSearchIcon = createIcon(IconName.Search);
export const MuiSearchOutlinedIcon = createIcon(IconName.SearchOutlined);
export const MuiSellIcon = createIcon(IconName.Sell);
export const MuiSettingsIcon = createIcon(IconName.Settings);
export const MuiSettingsBackupRestoreIcon = createIcon(
  IconName.SettingsBackupRestore,
);
export const MuiSettingsInputCompositeRoundedIcon = createIcon(
  IconName.SettingsInputCompositeRounded,
);
export const MuiSettingsOutlinedIcon = createIcon(IconName.SettingsOutlined);
export const MuiSettingsSystemDaydreamOutlinedIcon = createIcon(
  IconName.SettingsSystemDaydreamOutlined,
);
export const MuiShowChartOutlinedIcon = createIcon(IconName.ShowChartOutlined);
export const MuiShuffleIcon = createIcon(IconName.Shuffle);
export const MuiSkipNextIcon = createIcon(IconName.SkipNext);
export const MuiSmartToyIcon = createIcon(IconName.SmartToy);
export const MuiSpeedIcon = createIcon(IconName.Speed);
export const MuiSplitscreenIcon = createIcon(IconName.Splitscreen);
export const MuiStopCircleOutlinedIcon = createIcon(
  IconName.StopCircleOutlined,
);
export const MuiStorageIcon = createIcon(IconName.Storage);
export const MuiStraightenIcon = createIcon(IconName.Straighten);
export const MuiSubdirectoryArrowRightIcon = createIcon(
  IconName.SubdirectoryArrowRight,
);
export const MuiSubjectIcon = createIcon(IconName.Subject);
export const MuiSupportOutlinedIcon = createIcon(IconName.SupportOutlined);
export const MuiSyncIcon = createIcon(IconName.Sync);
export const MuiTableChartOutlinedIcon = createIcon(
  IconName.TableChartOutlined,
);
export const MuiTextureIcon = createIcon(IconName.Texture);
export const MuiThreeSixtyIcon = createIcon(IconName.ThreeSixty);
export const MuiTimelineIcon = createIcon(IconName.Timeline);
export const MuiTimelineOutlinedIcon = createIcon(IconName.TimelineOutlined);
export const MuiTimerIcon = createIcon(IconName.Timer);
export const MuiTimerOffIcon = createIcon(IconName.TimerOff);
export const MuiTrackChangesIcon = createIcon(IconName.TrackChanges);
export const MuiTuneIcon = createIcon(IconName.Tune);
export const MuiUnarchiveOutlinedIcon = createIcon(IconName.UnarchiveOutlined);
export const MuiUndoIcon = createIcon(IconName.Undo);
export const MuiUpgradeOutlinedIcon = createIcon(IconName.UpgradeOutlined);
export const MuiVerticalAlignTopIcon = createIcon(IconName.VerticalAlignTop);
export const MuiVideocamIcon = createIcon(IconName.Videocam);
export const MuiViewComfyIcon = createIcon(IconName.ViewComfy);
export const MuiViewInArIcon = createIcon(IconName.ViewInAr);
export const MuiVisibilityIcon = createIcon(IconName.Visibility);
export const MuiVisibilityOffIcon = createIcon(IconName.VisibilityOff);
export const MuiVisibilityOffOutlinedIcon = createIcon(
  IconName.VisibilityOffOutlined,
);
export const MuiVisibilityOutlinedIcon = createIcon(
  IconName.VisibilityOutlined,
);
export const MuiWallpaperIcon = createIcon(IconName.Wallpaper);
export const MuiWarningIcon = createIcon(IconName.Warning);
export const MuiWarningAmberIcon = createIcon(IconName.WarningAmber);
export const MuiWebhookIcon = createIcon(IconName.Webhook);
export const MuiWestIcon = createIcon(IconName.West);
export const MuiWorkspacesIcon = createIcon(IconName.Workspaces);
