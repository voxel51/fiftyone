## Variables

activeModalSample
activePlot
aggregationsTick
anyTagging
appConfig
appTeamsIsOpen
colorPool
colorscale
compactLayout
config
dataset
datasetName
defaultGroupSlice
defaultTargets
disabledPaths
elementNames
extendedSelection
extendedStages
extendedStagesUnsorted
filters
fullSchema
fullscreen
getSkeleton
getTarget
groupField
groupId
groupMediaTypes
groupPaginationFragment
groupQuery
groupSlices
hasPinnedSlice
hiddenLabelIds
hiddenLabels
hiddenLabelsArray
hoveredSample
isClipsView
isFramesView
isGroup
isLargeVideo
isNotebook
isPatchesView
isRootView
isVideoDataset
loading
lookerPanels
mainGroupSample
mediaFields
mediaType
modal
modalFilters
modalNavigation
modalTopBarVisible
patching
pathHiddenLabelsMap
pinnedSlice
pinnedSliceSample
readOnly
refreshGroupQuery
refresher
rootElementName
rootElementNamePlural
savedLookerOptions
savingFilters
selectedLabelIds
selectedLabelList
selectedLabels
selectedSamples
showOverlays
sidebarOverride
sidebarSampleId
similarityKeys
similarityParameters
similaritySorting
stageInfo
stateSubscription
targets
teams
theme
timeZone
view
viewCls
viewCounter

## Functions

\_activeFields(param)
activeField(param)
activeFields(param)
activeLabelFields(param)
activeLabelPaths(param)
activeLabelTags(param)
activeTags(param)
addNoneCounts(data, video)
aggregation(param)
aggregationQuery(parameter)
aggregations(param)
alpha(param)
appConfigOption(param)
boolean(param)
booleanFieldIsFiltered(param)
booleanSelectedValuesAtom(param)
boundedCount(param)
bounds(param)
boundsAtom(param)
buildSchema(dataset)
collapseFields(paths)
colorMap(param)
colorSeed(param)
coloring(param)
configuredSidebarModeDefault(param)
countValues(param)
createRouter(environment, routes, \_\_namedParameters)
cropToContent(param)
cumulativeCounts(param)
cumulativeValues(param)
currentSlice(param)
deferrer(initialized)
distribution(param)
distributionPaths(param)
excludeAtom(param)
expandPath(param)
falseAtom(param)
field(param)
fieldIsFiltered(param)
fieldPaths(param)
fieldSchema(param)
fieldType(param)
fields(param)
filter(param)
filterFields(param)
filterPaths(paths, schema)
filterView(stages)
filtersAreEqual(filtersOne, filtersTwo)
getDatasetName(context)
getEnvironment()
getSample(id)
getSampleSrc(url)
groupIsEmpty(param)
groupShown(param)
groupSlice(param)
groupStatistics(param)
hasFilters(param)
hiddenFieldLabels(param)
histogramValues(param)
imageFilters(param)
isDefaultRange(param)
labelCount(param)
labelFields(param)
labelPath(param)
labelPaths(param)
labelTagCounts(param)
lookerOptions(param)
makeRouteDefinitions(environment, children)
matchPath(pathname, options, variables)
matchRoutes(routes, pathname, variables, branch)
matchedTags(param)
meetsType(param)
noDistributionPathsData(param)
noneAtom(param)
nonfiniteAtom(param)
nonfiniteCount(param)
nonfiniteCounts(param)
numeric(param)
numericFieldIsFiltered(param)
pathColor(param)
pathFilter(param)
pathIsShown(param)
persistSidebarGroups(variables)
rangeAtom(param)
readableTags(param)
resolveGroups(dataset, current)
resolvedGroupSlice(param)
resolvedSidebarMode(param)
sampleTagCounts(param)
schemaReduce(schema, field)
selectedMediaField(param)
sidebarEntries(param)
sidebarGroup(param)
sidebarGroupMapping(param)
sidebarGroupNames(param)
sidebarGroups(param)
sidebarGroupsDefinition(param)
sidebarMode(param)
sidebarVisible(param)
sidebarWidth(param)
skeleton(param)
sortFilterResults(param)
string(param)
stringCountResults(param)
stringExcludeAtom(param)
stringSelectedValuesAtom(param)
stringifyObj(obj)
tagging(param)
textFilter(param)
transformDataset(dataset)
trueAtom(param)
useClearModal()
useCreateLooker(isModal, thumbnail, options, highlight)
useEntries(modal)
useEventHandler(target, eventType, handler, useCapture)
useExpandSample()
useFollow(leaderRef, followerRef, set)
useHashChangeHandler(handler)
useHelpPanel()
useHoveredSample(sample, auxHandlers)
useJSONPanel()
useKeydownHandler(handler)
useLabelTagText(modal)
useLookerOptions(modal)
useLookerStore()
useObserve(target, handler)
useOnSelectLabel()
useOutsideClick(ref, handler)
usePanel(name, atom)
useRefresh()
useReset()
useResizeHandler(handler)
useRouter(makeRoutes, deps)
useScreenshot(context)
useScrollHandler(handler)
useSelectFlashlightSample()
useSelectSample()
useSendEvent(force)
useSetDataset()
useSetExpandedSample(withGroup)
useSetExtendedSelection()
useSetGroupSlice()
useSetSelected()
useSetSelectedLabels()
useSetView(patch, selectSlice, onComplete)
useStateUpdate()
useTagText(modal)
useTo(state)
useTooltip()
useUnprocessedStateUpdate()
useUpdateSample()
useWindowSize()
validateGroupName(current, name)
values(param)
viewsAreEqual(viewOne, viewTwo)
@fiftyone/state

# State

# activeModalSample

```jsx
const [activeModalSample, setActiveModalSample] = useRecoilState(
  fos.activeModalSample
);
```

# activePlot

```jsx
const [activePlot, setActivePlot] = useRecoilState(fos.activePlot);
```

# aggregationsTick

```jsx
const [aggregationsTick, setAggregationsTick] = useRecoilState(
  fos.aggregationsTick
);
```

# anyTagging

```jsx
const [anyTagging, setAnyTagging] = useRecoilState(fos.anyTagging);
```

# appConfig

```jsx
const [appConfig, setAppConfig] = useRecoilState(fos.appConfig);
```

# appTeamsIsOpen

```jsx
const [appTeamsIsOpen, setAppTeamsIsOpen] = useRecoilState(fos.appTeamsIsOpen);
```

# colorPool

```jsx
const colorPool = useRecoilValue(fos.colorPool);
```

# colorscale

```jsx
const colorscale = useRecoilValue(fos.colorscale);
```

# compactLayout

```jsx
const [compactLayout, setCompactLayout] = useRecoilState(fos.compactLayout);
```

# config

| Property       | Type    |
| :------------- | :------ |
| colorscale     | string  |
| gridZoom       | number  |
| loopVideos     | boolean |
| notebookHeight | number  |
| showConfidence | boolean |
| showIndex      | boolean |
| showLabel      | boolean |
| showSkeletons  | boolean |
| showTooltip    | boolean |
| useFrameNumber | boolean |

```jsx
const config = useRecoilValue(fos.config);
```

# dataset

```jsx
const [dataset, setDataset] = useRecoilState(fos.dataset);
```

# datasetName

```jsx
const datasetName = useRecoilValue(fos.datasetName);
```

# defaultGroupSlice

```jsx
const defaultGroupSlice = useRecoilValue(fos.defaultGroupSlice);
```

# defaultTargets

```jsx
const defaultTargets = useRecoilValue(fos.defaultTargets);
```

# disabledPaths

```jsx
const disabledPaths = useRecoilValue(fos.disabledPaths);
```

# elementNames

| Property | Type   |
| :------- | :----- |
| plural   | string |
| singular | string |

```jsx
const elementNames = useRecoilValue(fos.elementNames);
```

# extendedSelection

```jsx
const [extendedSelection, setExtendedSelection] = useRecoilState(
  fos.extendedSelection
);
```

# extendedStages

| Property                              | Type |
| :------------------------------------ | :--- |
| fiftyone.core.stages.SortBySimilarity | any  |

```jsx
const extendedStages = useRecoilValue(fos.extendedStages);
```

# extendedStagesUnsorted

```jsx
const extendedStagesUnsorted = useRecoilValue(fos.extendedStagesUnsorted);
```

# filters

```jsx
const [filters, setFilters] = useRecoilState(fos.filters);
```

# fullSchema

```jsx
const fullSchema = useRecoilValue(fos.fullSchema);
```

# fullscreen

```jsx
const [fullscreen, setFullscreen] = useRecoilState(fos.fullscreen);
```

# getSkeleton

```jsx
const getSkeleton = useRecoilValue(fos.getSkeleton);
```

# getTarget

```jsx
const getTarget = useRecoilValue(fos.getTarget);
```

# groupField

```jsx
const groupField = useRecoilValue(fos.groupField);
```

# groupId

```jsx
const groupId = useRecoilValue(fos.groupId);
```

# groupMediaTypes

```jsx
const [groupMediaTypes, setGroupMediaTypes] = useRecoilState(
  fos.groupMediaTypes
);
```

# groupPaginationFragment

```jsx
const groupPaginationFragment = useRecoilValue(fos.groupPaginationFragment);
```

# groupQuery

```jsx
const [groupQuery, setGroupQuery] = useRecoilState(fos.groupQuery);
```

# groupSlices

```jsx
const groupSlices = useRecoilValue(fos.groupSlices);
```

# hasPinnedSlice

```jsx
const hasPinnedSlice = useRecoilValue(fos.hasPinnedSlice);
```

# hiddenLabelIds

```jsx
const hiddenLabelIds = useRecoilValue(fos.hiddenLabelIds);
```

# hiddenLabels

```jsx
const [hiddenLabels, setHiddenLabels] = useRecoilState(fos.hiddenLabels);
```

# hiddenLabelsArray

```jsx
const hiddenLabelsArray = useRecoilValue(fos.hiddenLabelsArray);
```

# hoveredSample

```jsx
const [hoveredSample, setHoveredSample] = useRecoilState(fos.hoveredSample);
```

# isClipsView

```jsx
const isClipsView = useRecoilValue(fos.isClipsView);
```

# isFramesView

```jsx
const isFramesView = useRecoilValue(fos.isFramesView);
```

# isGroup

```jsx
const isGroup = useRecoilValue(fos.isGroup);
```

# isLargeVideo

```jsx
const isLargeVideo = useRecoilValue(fos.isLargeVideo);
```

# isNotebook

```jsx
const isNotebook = useRecoilValue(fos.isNotebook);
```

# isPatchesView

```jsx
const isPatchesView = useRecoilValue(fos.isPatchesView);
```

# isRootView

```jsx
const isRootView = useRecoilValue(fos.isRootView);
```

# isVideoDataset

```jsx
const isVideoDataset = useRecoilValue(fos.isVideoDataset);
```

# loading

```jsx
const [loading, setLoading] = useRecoilState(fos.loading);
```

# lookerPanels

| Property    | Type    |
| :---------- | :------ |
| help.isOpen | boolean |
| json.isOpen | boolean |

```jsx
const [lookerPanels, setLookerPanels] = useRecoilState(fos.lookerPanels);
```

# mainGroupSample

```jsx
const mainGroupSample = useRecoilValue(fos.mainGroupSample);
```

# mediaFields

```jsx
const mediaFields = useRecoilValue(fos.mediaFields);
```

# mediaType

```jsx
const mediaType = useRecoilValue(fos.mediaType);
```

# modal

```jsx
const [modal, setModal] = useRecoilState(fos.modal);
```

# modalFilters

```jsx
const [modalFilters, setModalFilters] = useRecoilState(fos.modalFilters);
```

# modalNavigation

```jsx
const modalNavigation = useRecoilValue(fos.modalNavigation);
```

# modalTopBarVisible

```jsx
const [modalTopBarVisible, setModalTopBarVisible] = useRecoilState(
  fos.modalTopBarVisible
);
```

# patching

```jsx
const [patching, setPatching] = useRecoilState(fos.patching);
```

# pathHiddenLabelsMap

```jsx
const [pathHiddenLabelsMap, setPathHiddenLabelsMap] = useRecoilState(
  fos.pathHiddenLabelsMap
);
```

# pinnedSlice

```jsx
const pinnedSlice = useRecoilValue(fos.pinnedSlice);
```

# pinnedSliceSample

```jsx
const [pinnedSliceSample, setPinnedSliceSample] = useRecoilState(
  fos.pinnedSliceSample
);
```

# readOnly

```jsx
const [readOnly, setReadOnly] = useRecoilState(fos.readOnly);
```

# refreshGroupQuery

```jsx
const [refreshGroupQuery, setRefreshGroupQuery] = useRecoilState(
  fos.refreshGroupQuery
);
```

# refresher

```jsx
const [refresher, setRefresher] = useRecoilState(fos.refresher);
```

# rootElementName

```jsx
const rootElementName = useRecoilValue(fos.rootElementName);
```

# rootElementNamePlural

```jsx
const rootElementNamePlural = useRecoilValue(fos.rootElementNamePlural);
```

# savedLookerOptions

```jsx
const [savedLookerOptions, setSavedLookerOptions] = useRecoilState(
  fos.savedLookerOptions
);
```

# savingFilters

```jsx
const [savingFilters, setSavingFilters] = useRecoilState(fos.savingFilters);
```

# selectedLabelIds

```jsx
const selectedLabelIds = useRecoilValue(fos.selectedLabelIds);
```

# selectedLabelList

```jsx
const selectedLabelList = useRecoilValue(fos.selectedLabelList);
```

# selectedLabels

```jsx
const [selectedLabels, setSelectedLabels] = useRecoilState(fos.selectedLabels);
```

# selectedSamples

```jsx
const [selectedSamples, setSelectedSamples] = useRecoilState(
  fos.selectedSamples
);
```

# showOverlays

```jsx
const [showOverlays, setShowOverlays] = useRecoilState(fos.showOverlays);
```

# sidebarOverride

```jsx
const [sidebarOverride, setSidebarOverride] = useRecoilState(
  fos.sidebarOverride
);
```

# sidebarSampleId

```jsx
const sidebarSampleId = useRecoilValue(fos.sidebarSampleId);
```

# similarityKeys

```jsx
const similarityKeys = useRecoilValue(fos.similarityKeys);
```

# similarityParameters

```jsx
const [similarityParameters, setSimilarityParameters] = useRecoilState(
  fos.similarityParameters
);
```

# similaritySorting

```jsx
const [similaritySorting, setSimilaritySorting] = useRecoilState(
  fos.similaritySorting
);
```

# stageInfo

```jsx
const [stageInfo, setStageInfo] = useRecoilState(fos.stageInfo);
```

# stateSubscription

```jsx
const stateSubscription = useRecoilValue(fos.stateSubscription);
```

# targets

```jsx
const targets = useRecoilValue(fos.targets);
```

# teams

| Property  | Type    |
| :-------- | :------ |
| minimized | boolean |
| open      | boolean |
| submitted | boolean |

```jsx
const [teams, setTeams] = useRecoilState(fos.teams);
```

# theme

```jsx
const [theme, setTheme] = useRecoilState(fos.theme);
```

# timeZone

```jsx
const timeZone = useRecoilValue(fos.timeZone);
```

# view

```jsx
const [view, setView] = useRecoilState(fos.view);
```

# viewCls

```jsx
const [viewCls, setViewCls] = useRecoilState(fos.viewCls);
```

# viewCounter

```jsx
const [viewCounter, setViewCounter] = useRecoilState(fos.viewCounter);
```

# \_activeFields(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# activeField(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# activeFields(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# activeLabelFields(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# activeLabelPaths(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# activeLabelTags(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# activeTags(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# addNoneCounts(data, video)

| Param | Type    |
| :---- | :------ |
| video | boolean |

# aggregation(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# aggregationQuery(parameter)

| Param              | Type    |
| :----------------- | :------ |
| parameter.extended | boolean |
| parameter.modal    | boolean |
| parameter.root     | boolean |

# aggregations(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |

# alpha(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# appConfigOption(param)

| Param       | Type    |
| :---------- | :------ |
| param.key   | string  |
| param.modal | boolean |

# boolean(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# booleanFieldIsFiltered(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# booleanSelectedValuesAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# boundedCount(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# bounds(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# boundsAtom(param)

| Param      | Type   |
| :--------- | :----- |
| param.path | string |

# buildSchema(dataset)

# collapseFields(paths)

| Param | Type |
| :---- | :--- |
| paths | any  |

# colorMap(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# colorSeed(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# coloring(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# configuredSidebarModeDefault(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# countValues(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# createRouter(environment, routes, \_\_namedParameters)

| Param                      | Type    |
| :------------------------- | :------ |
| \_\_namedParameters.errors | boolean |

# cropToContent(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# cumulativeCounts(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# cumulativeValues(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# currentSlice(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# deferrer(initialized)

# distribution(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# distributionPaths(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# excludeAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# expandPath(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# falseAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# field(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# fieldIsFiltered(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# fieldPaths(param)

| Param      | Type   |
| :--------- | :----- |
| param.path | string |

# fieldSchema(param)

# fieldType(param)

| Param                 | Type    |
| :-------------------- | :------ |
| param.path            | string  |
| param.useListSubfield | boolean |

# fields(param)

| Param      | Type   |
| :--------- | :----- |
| param.path | string |

# filter(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# filterFields(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# filterPaths(paths, schema)

# filterView(stages)

| Param  | Type |
| :----- | :--- |
| stages | any  |

# filtersAreEqual(filtersOne, filtersTwo)

| Param      | Type |
| :--------- | :--- |
| filtersOne | any  |
| filtersTwo | any  |

# getDatasetName(context)

# getEnvironment()

# getSample(id)

| Param | Type   |
| :---- | :----- |
| id    | string |

# getSampleSrc(url)

| Param | Type   |
| :---- | :----- |
| url   | string |

# groupIsEmpty(param)

| Param       | Type    |
| :---------- | :------ |
| param.group | string  |
| param.modal | boolean |

# groupShown(param)

| Param         | Type    |
| :------------ | :------ |
| param.group   | string  |
| param.loading | boolean |
| param.modal   | boolean |

# groupSlice(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# groupStatistics(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# hasFilters(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# hiddenFieldLabels(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# histogramValues(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# imageFilters(param)

| Param        | Type    |
| :----------- | :------ |
| param.filter | string  |
| param.modal  | boolean |

# isDefaultRange(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# labelCount(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |

# labelFields(param)

# labelPath(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# labelPaths(param)

| Param          | Type    |
| :------------- | :------ |
| param.expanded | boolean |

# labelTagCounts(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |

# lookerOptions(param)

| Param            | Type    |
| :--------------- | :------ |
| param.modal      | boolean |
| param.withFilter | boolean |

# makeRouteDefinitions(environment, children)

# matchPath(pathname, options, variables)

| Param    | Type   |
| :------- | :----- |
| pathname | string |

# matchRoutes(routes, pathname, variables, branch)

| Param    | Type   |
| :------- | :----- |
| pathname | string |

# matchedTags(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# meetsType(param)

| Param             | Type    |
| :---------------- | :------ |
| param.acceptLists | boolean |
| param.path        | string  |
| param.under       | boolean |

# noDistributionPathsData(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# noneAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# nonfiniteAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# nonfiniteCount(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# nonfiniteCounts(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# numeric(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# numericFieldIsFiltered(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# pathColor(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# pathFilter(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# pathIsShown(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# persistSidebarGroups(variables)

# rangeAtom(param)

| Param            | Type    |
| :--------------- | :------ |
| param.modal      | boolean |
| param.path       | string  |
| param.withBounds | boolean |

# readableTags(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |

# resolveGroups(dataset, current)

# resolvedGroupSlice(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# resolvedSidebarMode(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sampleTagCounts(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |

# schemaReduce(schema, field)

# selectedMediaField(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sidebarEntries(param)

| Param          | Type    |
| :------------- | :------ |
| param.filtered | boolean |
| param.loading  | boolean |
| param.modal    | boolean |

# sidebarGroup(param)

| Param          | Type    |
| :------------- | :------ |
| param.filtered | boolean |
| param.group    | string  |
| param.loading  | boolean |
| param.modal    | boolean |

# sidebarGroupMapping(param)

| Param          | Type    |
| :------------- | :------ |
| param.filtered | boolean |
| param.loading  | boolean |
| param.modal    | boolean |

# sidebarGroupNames(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sidebarGroups(param)

| Param          | Type    |
| :------------- | :------ |
| param.filtered | boolean |
| param.loading  | boolean |
| param.modal    | boolean |
| param.persist  | boolean |

# sidebarGroupsDefinition(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sidebarMode(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sidebarVisible(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# sidebarWidth(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# skeleton(param)

| Param | Type   |
| :---- | :----- |
| param | string |

# sortFilterResults(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# string(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# stringCountResults(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# stringExcludeAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# stringSelectedValuesAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# stringifyObj(obj)

| Param | Type |
| :---- | :--- |
| obj   | any  |

# tagging(param)

| Param        | Type    |
| :----------- | :------ |
| param.labels | boolean |
| param.modal  | boolean |

# textFilter(param)

| Param | Type    |
| :---- | :------ |
| param | boolean |

# transformDataset(dataset)

| Param   | Type |
| :------ | :--- |
| dataset | any  |

# trueAtom(param)

| Param       | Type    |
| :---------- | :------ |
| param.modal | boolean |
| param.path  | string  |

# useClearModal()

# useCreateLooker(isModal, thumbnail, options, highlight)

| Param     | Type    |
| :-------- | :------ |
| isModal   | boolean |
| thumbnail | boolean |
| highlight | boolean |

# useEntries(modal)

| Param | Type    |
| :---- | :------ |
| modal | boolean |

# useEventHandler(target, eventType, handler, useCapture)

| Param      | Type    |
| :--------- | :------ |
| target     | any     |
| eventType  | any     |
| handler    | any     |
| useCapture | boolean |

# useExpandSample()

# useFollow(leaderRef, followerRef, set)

| Param       | Type |
| :---------- | :--- |
| leaderRef   | any  |
| followerRef | any  |
| set         | any  |

# useHashChangeHandler(handler)

| Param   | Type |
| :------ | :--- |
| handler | any  |

# useHelpPanel()

# useHoveredSample(sample, auxHandlers)

| Param       | Type |
| :---------- | :--- |
| auxHandlers | any  |

# useJSONPanel()

# useKeydownHandler(handler)

| Param   | Type |
| :------ | :--- |
| handler | any  |

# useLabelTagText(modal)

| Param | Type    |
| :---- | :------ |
| modal | boolean |

# useLookerOptions(modal)

| Param | Type    |
| :---- | :------ |
| modal | boolean |

# useLookerStore()

# useObserve(target, handler)

| Param   | Type |
| :------ | :--- |
| target  | any  |
| handler | any  |

# useOnSelectLabel()

# useOutsideClick(ref, handler)

| Param   | Type |
| :------ | :--- |
| ref     | any  |
| handler | any  |

# usePanel(name, atom)

| Param | Type |
| :---- | :--- |
| name  | any  |
| atom  | any  |

# useRefresh()

# useReset()

# useResizeHandler(handler)

| Param   | Type |
| :------ | :--- |
| handler | any  |

# useRouter(makeRoutes, deps)

# useScreenshot(context)

# useScrollHandler(handler)

| Param   | Type |
| :------ | :--- |
| handler | any  |

# useSelectFlashlightSample()

# useSelectSample()

# useSendEvent(force)

| Param | Type    |
| :---- | :------ |
| force | boolean |

# useSetDataset()

# useSetExpandedSample(withGroup)

| Param     | Type    |
| :-------- | :------ |
| withGroup | boolean |

# useSetExtendedSelection()

# useSetGroupSlice()

# useSetSelected()

# useSetSelectedLabels()

# useSetView(patch, selectSlice, onComplete)

| Param       | Type    |
| :---------- | :------ |
| patch       | boolean |
| selectSlice | boolean |

# useStateUpdate()

# useTagText(modal)

| Param | Type    |
| :---- | :------ |
| modal | boolean |

# useTo(state)

| Param | Type |
| :---- | :--- |
| state | any  |

# useTooltip()

# useUnprocessedStateUpdate()

# useUpdateSample()

# useWindowSize()

# validateGroupName(current, name)

| Param | Type   |
| :---- | :----- |
| name  | string |

# values(param)

| Param          | Type    |
| :------------- | :------ |
| param.extended | boolean |
| param.modal    | boolean |
| param.path     | string  |

# viewsAreEqual(viewOne, viewTwo)

| Param   | Type |
| :------ | :--- |
| viewOne | any  |
| viewTwo | any  |
