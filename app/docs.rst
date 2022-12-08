.. js:module:: @fiftyone/state

Namespace
=========

SPACE
=====

TagKey
======

Enumeration
===========

EntryKind
=========

Interface
=========

Type alias
==========

Variable
========

.. js:data:: DEFAULT_ALPHA

.. js:data:: EventsContext

.. js:data:: IMAGE_FILTERS

.. js:data:: MATCH_LABEL_TAGS

.. js:data:: RESERVED_GROUPS

.. js:data:: RelayEnvironmentKey

.. js:data:: RouterContext

.. js:data:: activeModalSample

.. js:data:: activePlot

.. js:data:: aggregationsTick

.. js:data:: anyTagging

.. js:data:: appConfig

.. js:data:: appConfigDefault

.. js:data:: appTeamsIsOpen

.. js:data:: booleanCountResults

.. js:data:: colorPool

.. js:data:: colorscale

.. js:data:: compactLayout

.. js:data:: config

.. js:data:: count

.. js:data:: counts

.. js:data:: dataset

.. js:data:: datasetName

.. js:data:: defaultGroupSlice

.. js:data:: defaultTargets

.. js:data:: disabledPaths

.. js:data:: elementNames

.. js:data:: extendedSelection

.. js:data:: extendedStages

.. js:data:: extendedStagesUnsorted

.. js:data:: filters

.. js:data:: fullSchema

.. js:data:: fullscreen

.. js:data:: getSkeleton

.. js:data:: getTarget

.. js:data:: groupField

.. js:data:: groupId

.. js:data:: groupMediaTypes

.. js:data:: groupPaginationFragment

.. js:data:: groupQuery

.. js:data:: groupSlices

.. js:data:: hasPinnedSlice

.. js:data:: hiddenLabelIds

.. js:data:: hiddenLabels

.. js:data:: hiddenLabelsArray

.. js:data:: hoveredSample

.. js:data:: isClipsView

.. js:data:: isFramesView

.. js:data:: isGroup

.. js:data:: isLargeVideo

.. js:data:: isNotebook

.. js:data:: isPatchesView

.. js:data:: isRootView

.. js:data:: isVideoDataset

.. js:data:: loading

.. js:data:: lookerPanels

.. js:data:: mainGroupSample

.. js:data:: mediaFields

.. js:data:: mediaType

.. js:data:: modal

.. js:data:: modalFilters

.. js:data:: modalNavigation

.. js:data:: modalTopBarVisible

.. js:data:: noneCount

.. js:data:: patching

.. js:data:: pathHiddenLabelsMap

.. js:data:: pinnedSlice

.. js:data:: pinnedSliceSample

.. js:data:: readOnly

.. js:data:: refreshGroupQuery

.. js:data:: refresher

.. js:data:: rootElementName

.. js:data:: rootElementNamePlural

.. js:data:: savedLookerOptions

.. js:data:: savingFilters

.. js:data:: selectedLabelIds

.. js:data:: selectedLabelList

.. js:data:: selectedLabels

.. js:data:: selectedSamples

.. js:data:: showOverlays

.. js:data:: sidebarOverride

.. js:data:: sidebarSampleId

.. js:data:: similarityKeys

.. js:data:: similarityParameters

.. js:data:: similaritySorting

.. js:data:: stageInfo

.. js:data:: stateSubscription

.. js:data:: stores

.. js:data:: targets

.. js:data:: teams

.. js:data:: theme

.. js:data:: timeZone

.. js:data:: view

.. js:data:: viewCls

.. js:data:: viewCounter

Function
========

.. js:function:: activeField(params)

   :summary: This is a summary of the function...

   :param: Object params: 
   :param: Boolean params.modal: Whether the field is in a modal or not
   :param: String params.path: The path of the field
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: activeFields(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :returns: RecoilState<String[]> 

.. js:function:: activeLabelFields(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: activeLabelPaths(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: activeLabelTags(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String[]> 

.. js:function:: activeTags(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String[]> 

.. js:function:: addNoneCounts(data, video)

   :param AggregationsData data: 
   :param Boolean video: 
   :returns: Void 

.. js:function:: aggregation(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Object> 

.. js:function:: aggregationQuery(parameter)

   :param Object parameter: 
   :param Boolean parameter.extended: 
   :param Boolean parameter.modal: 
   :param String[] parameter.paths: 
   :param Boolean parameter.root: 
   :returns: RecoilState<AggregationsQuery$data> 

.. js:function:: aggregations(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String[] param.paths: 
   :returns: readonly RecoilValueReadOnly<readonly Any> 

.. js:function:: alpha(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Number> 

.. js:function:: appConfigOption(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String param.key: 
   :param Boolean param.modal: 
   :returns: RecoilState<Any> 

.. js:function:: boolean(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: booleanFieldIsFiltered(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: booleanSelectedValuesAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Object | Boolean[]> 

.. js:function:: boundedCount(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Number> 

.. js:function:: bounds(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Any> 

.. js:function:: boundsAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Range> 

.. js:function:: buildSchema(dataset)

   :param Dataset dataset: 
   :returns: Schema 

.. js:function:: collapseFields(paths)

   :param Any paths: 
   :returns: StrictField[] 

.. js:function:: colorMap(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: colorSeed(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Number> 

.. js:function:: coloring(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<Coloring> 

.. js:function:: configuredSidebarModeDefault(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<String | String | String> 

.. js:function:: countValues(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Object | Object> 

.. js:function:: createRouter(environment, routes, __namedParameters)

   :param Default environment: 
   :param RouteDefinition<OperationType>[] routes: 
   :param Object __namedParameters: 
   :param Boolean __namedParameters.errors: 
   :returns: Router<Any> 

.. js:function:: cropToContent(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Boolean> 

.. js:function:: cumulativeCounts(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String[] param.embeddedDocType: 
   :param Boolean param.extended: 
   :param String | String[] param.ftype: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: cumulativeValues(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String[] param.embeddedDocType: 
   :param Boolean param.extended: 
   :param String | String[] param.ftype: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: currentSlice(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<Object | String> 

.. js:function:: deferrer(initialized)

   :param MutableRefObject<Boolean> initialized: 
   :returns: Any 

.. js:function:: distribution(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Object | Object | Object | Object | Object> 

.. js:function:: distributionPaths(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: excludeAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: expandPath(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<String> 

.. js:function:: falseAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: field(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: fieldIsFiltered(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: fieldPaths(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String[] param.embeddedDocType: 
   :param String | String[] param.ftype: 
   :param String param.path: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: fieldSchema(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<Schema> 

.. js:function:: fieldType(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String param.path: 
   :param Boolean param.useListSubfield: 
   :returns: readonly RecoilValueReadOnly<String> 

.. js:function:: fields(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String[] param.embeddedDocType: 
   :param String | String[] param.ftype: 
   :param String param.path: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<Field[]> 

.. js:function:: filter(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Filter> 

.. js:function:: filterFields(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: filterPaths(paths, schema)

   :param Object | String[] paths: 
   :param Schema schema: 
   :returns: String[] 

.. js:function:: filterView(stages)

   :param Any stages: 
   :returns: String 

.. js:function:: filtersAreEqual(filtersOne, filtersTwo)

   :param Any filtersOne: 
   :param Any filtersTwo: 
   :returns: Boolean 

.. js:function:: getDatasetName(context)

   :param RoutingContext<Any> context: 
   :returns: String 

.. js:function:: getEnvironment()
   :returns: Default 

.. js:function:: getSample(id)

   :param String id: 
   :returns: Undefined | SampleData 

.. js:function:: getSampleSrc(url)

   :param String url: 
   :returns: String 

.. js:function:: groupIsEmpty(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String param.group: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: groupShown(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String param.group: 
   :param Boolean param.loading: 
   :param Boolean param.modal: 
   :returns: RecoilState<Boolean> 

.. js:function:: groupSlice(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String> 

.. js:function:: groupStatistics(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String | String> 

.. js:function:: hasFilters(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: hiddenFieldLabels(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: histogramValues(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Object | Object | Object> 

.. js:function:: imageFilters(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String param.filter: 
   :param Boolean param.modal: 
   :returns: RecoilState<Number> 

.. js:function:: isDefaultRange(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: labelCount(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<Object | Number> 

.. js:function:: labelFields(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: labelPath(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<String> 

.. js:function:: labelPaths(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.expanded: 
   :param SPACE param.space: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: labelTagCounts(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: lookerOptions(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param Boolean param.withFilter: 
   :returns: readonly RecoilValueReadOnly<Partial<Omit<FrameOptions | ImageOptions | VideoOptions, String>>> 

.. js:function:: makeRouteDefinitions(environment, children)

   :param Environment environment: 
   :param RouteOptions<T>[] children: 
   :returns: RouteDefinition<T>[] 

.. js:function:: matchPath(pathname, options, variables)

   :param String pathname: 
   :param MatchPathOptions options: 
   :param Partial<VariablesOf<Any>> variables: 
   :returns: Object | MatchPathResult<T> 

.. js:function:: matchRoutes(routes, pathname, variables, branch)

   :param RouteBase<T>[] routes: 
   :param String pathname: 
   :param Any variables: 
   :param Object[] branch: 
   :returns: Object[] 

.. js:function:: matchedTags(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param TagKey param.key: 
   :param Boolean param.modal: 
   :returns: RecoilState<Set<String>> 

.. js:function:: meetsType(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.acceptLists: 
   :param String | String[] param.embeddedDocType: 
   :param String | String[] param.ftype: 
   :param String param.path: 
   :param Boolean param.under: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: noDistributionPathsData(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: noneAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: nonfiniteAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String | String | String param.key: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: nonfiniteCount(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Nonfinite param.key: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Number> 

.. js:function:: nonfiniteCounts(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<NonfiniteCounts> 

.. js:function:: numeric(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: numericFieldIsFiltered(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: pathColor(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :param TagKey param.tag: 
   :returns: readonly RecoilValueReadOnly<String> 

.. js:function:: pathFilter(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: pathIsShown(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Boolean> 

.. js:function:: persistSidebarGroups(variables)

   :param SetSidebarGroupsMutation$variables variables: 
   :returns: Void 

.. js:function:: rangeAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Range param.defaultRange: 
   :param Boolean param.modal: 
   :param String param.path: 
   :param Boolean param.withBounds: 
   :returns: RecoilState<Range> 

.. js:function:: readableTags(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param String | String param.group: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: resolveGroups(dataset, current)

   :param Dataset dataset: 
   :param SidebarGroup[] current: 
   :returns: SidebarGroup[] 

.. js:function:: resolvedGroupSlice(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<String> 

.. js:function:: resolvedSidebarMode(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<String | String> 

.. js:function:: sampleTagCounts(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: schemaReduce(schema, field)

   :param Schema schema: 
   :param StrictField field: 
   :returns: Schema 

.. js:function:: selectedMediaField(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String> 

.. js:function:: sidebarEntries(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.filtered: 
   :param Boolean param.loading: 
   :param Boolean param.modal: 
   :returns: RecoilState<SidebarEntry[]> 

.. js:function:: sidebarGroup(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.filtered: 
   :param String param.group: 
   :param Boolean param.loading: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: sidebarGroupMapping(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.filtered: 
   :param Boolean param.loading: 
   :param Boolean param.modal: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: sidebarGroupNames(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: sidebarGroups(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.filtered: 
   :param Boolean param.loading: 
   :param Boolean param.modal: 
   :param Boolean param.persist: 
   :returns: RecoilState<SidebarGroup[]> 

.. js:function:: sidebarGroupsDefinition(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<SidebarGroup[]> 

.. js:function:: sidebarMode(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Object | String | String | String> 

.. js:function:: sidebarVisible(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Boolean> 

.. js:function:: sidebarWidth(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<Number> 

.. js:function:: skeleton(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param String param: 
   :returns: readonly RecoilValueReadOnly<Object | KeypointSkeleton> 

.. js:function:: sortFilterResults(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<SortResults> 

.. js:function:: string(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<Any> 

.. js:function:: stringCountResults(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Object> 

.. js:function:: stringExcludeAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: stringSelectedValuesAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Object | String[]> 

.. js:function:: stringifyObj(obj)

   :param Any obj: 
   :returns: Any 

.. js:function:: tagging(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.labels: 
   :param Boolean param.modal: 
   :returns: RecoilState<Boolean> 

.. js:function:: textFilter(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Boolean param: 
   :returns: RecoilState<String> 

.. js:function:: transformDataset(dataset)

   :param Any dataset: 
   :returns: Readonly<Dataset> 

.. js:function:: trueAtom(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: RecoilState<Boolean> 

.. js:function:: useClearModal()
   A react hook that allows clearing the modal state.
   :returns: Any 

.. js:function:: useCreateLooker(isModal, thumbnail, options, highlight)

   :param Boolean isModal: 
   :param Boolean thumbnail: 
   :param Omit<ReturnType<Any>, String> options: 
   :param Boolean highlight: 
   :returns: MutableRefObject<Any> 

.. js:function:: useEntries(modal)

   :param Boolean modal: 
   :returns: Any 

.. js:function:: useEventHandler(target, eventType, handler, useCapture)

   :param Any target: 
   :param Any eventType: 
   :param Any handler: 
   :param Boolean useCapture: 
   :returns: Void 

.. js:function:: useExpandSample()
   :returns: Any 

.. js:function:: useFollow(leaderRef, followerRef, set)

   :param Any leaderRef: 
   :param Any followerRef: 
   :param Any set: 
   :returns: Void 

.. js:function:: useHashChangeHandler(handler)

   :param Any handler: 
   :returns: Void 

.. js:function:: useHelpPanel()
   :returns: Object 

.. js:function:: useHoveredSample(sample, auxHandlers)

   :param AppSample sample: 
   :param Any auxHandlers: 
   :returns: Object 

.. js:function:: useJSONPanel()
   :returns: Object 

.. js:function:: useKeydownHandler(handler)

   :param Any handler: 
   :returns: Void 

.. js:function:: useLabelTagText(modal)

   :param Boolean modal: 
   :returns: Object 

.. js:function:: useLookerOptions(modal)

   :param Boolean modal: 
   :returns: Partial<Omit<FrameOptions | ImageOptions | VideoOptions, String>> 

.. js:function:: useLookerStore()
   :returns: LookerStore<Lookers> 

.. js:function:: useObserve(target, handler)

   :param Any target: 
   :param Any handler: 
   :returns: Void 

.. js:function:: useOnSelectLabel()
   :returns: Any 

.. js:function:: useOutsideClick(ref, handler)

   :param Any ref: 
   :param Any handler: 
   :returns: Void 

.. js:function:: usePanel(name, atom)

   :param Any name: 
   :param Any atom: 
   :returns: Object 

.. js:function:: useRefresh()
   :returns: Any 

.. js:function:: useReset()
   :returns: Any 

.. js:function:: useResizeHandler(handler)

   :param Any handler: 
   :returns: Void 

.. js:function:: useRouter(makeRoutes, deps)

   :param Any makeRoutes: 
   :param DependencyList deps: 
   :returns: Object 

.. js:function:: useScreenshot(context)

   :param Undefined | String | String | String context: 
   :returns: Any 

.. js:function:: useScrollHandler(handler)

   :param Any handler: 
   :returns: Void 

.. js:function:: useSelectFlashlightSample()
   :returns: Any 

.. js:function:: useSelectSample()
   :returns: Any 

.. js:function:: useSendEvent(force)

   :param Boolean force: 
   :returns: Any 

.. js:function:: useSetDataset()
   :returns: Any 

.. js:function:: useSetExpandedSample(withGroup)

   :param Boolean withGroup: 
   :returns: Any 

.. js:function:: useSetExtendedSelection()
   :returns: Any 

.. js:function:: useSetGroupSlice()
   :returns: Any 

.. js:function:: useSetSelected()
   :returns: Any 

.. js:function:: useSetSelectedLabels()
   :returns: Any 

.. js:function:: useSetView(patch, selectSlice, onComplete)

   :param Boolean patch: 
   :param Boolean selectSlice: 
   :param Any onComplete: 
   :returns: Any 

.. js:function:: useStateUpdate()
   :returns: Any 

.. js:function:: useTagText(modal)

   :param Boolean modal: 
   :returns: Object 

.. js:function:: useTo(state)

   :param Any state: 
   :returns: Object 

.. js:function:: useTooltip()
   :returns: Object 

.. js:function:: useUnprocessedStateUpdate()
   :returns: Any 

.. js:function:: useUpdateSample()
   :returns: Any 

.. js:function:: useWindowSize()
   :returns: Object 

.. js:function:: validateGroupName(current, name)

   :param String[] current: 
   :param String name: 
   :returns: Boolean 

.. js:function:: values(param)
   Returns a function which returns a memoized atom for each unique parameter value.

   :param Object param: 
   :param Boolean param.extended: 
   :param Boolean param.modal: 
   :param String param.path: 
   :returns: readonly RecoilValueReadOnly<String[]> 

.. js:function:: viewsAreEqual(viewOne, viewTwo)

   :param Any viewOne: 
   :param Any viewTwo: 
   :returns: Boolean 
