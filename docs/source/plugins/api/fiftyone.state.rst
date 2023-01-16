fiftyone.state
==============

.. js:module:: fiftyone.state

State
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeModalSample:

activeModalSample
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "activeModalSample","``Union<`` :js:class:`fiftyone.state.AppSample` ``,`` ``Object`` ``>``"

.. code-block:: typescript

   const activeModalSample = useRecoilValue(fos.activeModalSample);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activePlot:

activePlot
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "activePlot","``string``"

.. code-block:: typescript

   const [activePlot, setActivePlot] = useRecoilState(fos.activePlot);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.anyTagging:

anyTagging
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "anyTagging","``boolean``"

.. code-block:: typescript

   const [anyTagging, setAnyTagging] = useRecoilState(fos.anyTagging);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.appTeamsIsOpen:

appTeamsIsOpen
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "appTeamsIsOpen","``boolean``"

.. code-block:: typescript

   const [appTeamsIsOpen, setAppTeamsIsOpen] = useRecoilState(fos.appTeamsIsOpen);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.canEditSavedViews:

canEditSavedViews
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "canEditSavedViews","``boolean``"

.. code-block:: typescript

   const [canEditSavedViews, setCanEditSavedViews] = useRecoilState(fos.canEditSavedViews);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.colorPool:

colorPool
~~~~~~~~~

.. code-block:: typescript

   const colorPool = useRecoilValue(fos.colorPool);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.colorscale:

colorscale
~~~~~~~~~~

.. code-block:: typescript

   const colorscale = useRecoilValue(fos.colorscale);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.compactLayout:

compactLayout
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "compactLayout","``boolean``"

.. code-block:: typescript

   const [compactLayout, setCompactLayout] = useRecoilState(fos.compactLayout);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.config:

config
~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "config.colorBy",":js:class:`fiftyone.state.ColorBy`"
  "config.colorPool","``readonly``"
  "config.colorscale","``string``"
  "config.gridZoom","``number``"
  "config.loopVideos","``boolean``"
  "config.notebookHeight","``number``"
  "config.plugins","``object``"
  "config.showConfidence","``boolean``"
  "config.showIndex","``boolean``"
  "config.showLabel","``boolean``"
  "config.showSkeletons","``boolean``"
  "config.showTooltip","``boolean``"
  "config.sidebarMode",":js:class:`fiftyone.state.SidebarMode`"
  "config.theme",":js:class:`fiftyone.state.Theme`"
  "config.timezone","``string``"
  "config.useFrameNumber","``boolean``"

.. code-block:: typescript

   const config = useRecoilValue(fos.config);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.currentViewSlug:

currentViewSlug
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "currentViewSlug","``string``"

.. code-block:: typescript

   const currentViewSlug = useRecoilValue(fos.currentViewSlug);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.dataset:

dataset
~~~~~~~

The state of the current dataset. Contains informations about the dataset, and the samples contained in it.

See :py:class:`fiftyone.core.dataset.Dataset` for python documentation.

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "dataset",":js:class:`fiftyone.state.Dataset`"

.. code-block:: typescript

   const [dataset, setDataset] = useRecoilState(fos.dataset);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.datasetAppConfig:

datasetAppConfig
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "datasetAppConfig",":js:class:`fiftyone.state.DatasetAppConfig`"

.. code-block:: typescript

   const datasetAppConfig = useRecoilValue(fos.datasetAppConfig);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.datasetName:

datasetName
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "datasetName","``string``"

.. code-block:: typescript

   const datasetName = useRecoilValue(fos.datasetName);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.defaultGroupSlice:

defaultGroupSlice
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "defaultGroupSlice","``string``"

.. code-block:: typescript

   const defaultGroupSlice = useRecoilValue(fos.defaultGroupSlice);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.defaultTargets:

defaultTargets
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "defaultTargets",":js:class:`fiftyone.state.Targets`"

.. code-block:: typescript

   const defaultTargets = useRecoilValue(fos.defaultTargets);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.disabledPaths:

disabledPaths
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "disabledPaths","``Set < string >`` ``<`` ``string`` ``>``"

.. code-block:: typescript

   const disabledPaths = useRecoilValue(fos.disabledPaths);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.elementNames:

elementNames
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "elementNames.plural","``string``"
  "elementNames.singular","``string``"

.. code-block:: typescript

   const elementNames = useRecoilValue(fos.elementNames);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.extendedSelection:

extendedSelection
~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const [extendedSelection, setExtendedSelection] = useRecoilState(fos.extendedSelection);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.extendedStages:

extendedStages
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "extendedStages.fiftyone.core.stages.Select","``Object``"
  "extendedStages.fiftyone.core.stages.SortBySimilarity",":js:class:`fiftyone.state.O`"

.. code-block:: typescript

   const extendedStages = useRecoilValue(fos.extendedStages);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.extendedStagesUnsorted:

extendedStagesUnsorted
~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "extendedStagesUnsorted.fiftyone.core.stages.Select","``Object``"

.. code-block:: typescript

   const extendedStagesUnsorted = useRecoilValue(fos.extendedStagesUnsorted);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.filters:

filters
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "filters",":js:class:`fiftyone.state.Filters`"

.. code-block:: typescript

   const [filters, setFilters] = useRecoilState(fos.filters);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fullSchema:

fullSchema
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "fullSchema",":js:class:`fiftyone.state.Schema`"

.. code-block:: typescript

   const fullSchema = useRecoilValue(fos.fullSchema);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fullscreen:

fullscreen
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "fullscreen","``boolean``"

.. code-block:: typescript

   const [fullscreen, setFullscreen] = useRecoilState(fos.fullscreen);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getSkeleton:

getSkeleton
~~~~~~~~~~~

.. code-block:: typescript

   const getSkeleton = useRecoilValue(fos.getSkeleton);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getTarget:

getTarget
~~~~~~~~~

.. code-block:: typescript

   const getTarget = useRecoilValue(fos.getTarget);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupField:

groupField
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "groupField","``string``"

.. code-block:: typescript

   const groupField = useRecoilValue(fos.groupField);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupId:

groupId
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "groupId","``string``"

.. code-block:: typescript

   const groupId = useRecoilValue(fos.groupId);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupMediaTypes:

groupMediaTypes
~~~~~~~~~~~~~~~

.. code-block:: typescript

   const groupMediaTypes = useRecoilValue(fos.groupMediaTypes);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupPaginationFragment:

groupPaginationFragment
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "groupPaginationFragment",":js:class:`fiftyone.state.paginateGroup_query$key`"

.. code-block:: typescript

   const groupPaginationFragment = useRecoilValue(fos.groupPaginationFragment);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupQuery:

groupQuery
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "groupQuery",":js:class:`fiftyone.state.paginateGroupQuery$data`"

.. code-block:: typescript

   const [groupQuery, setGroupQuery] = useRecoilState(fos.groupQuery);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupSlices:

groupSlices
~~~~~~~~~~~

.. code-block:: typescript

   const groupSlices = useRecoilValue(fos.groupSlices);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hasPinnedSlice:

hasPinnedSlice
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "hasPinnedSlice","``boolean``"

.. code-block:: typescript

   const hasPinnedSlice = useRecoilValue(fos.hasPinnedSlice);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hiddenLabelIds:

hiddenLabelIds
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "hiddenLabelIds","``Set < string >`` ``<`` ``string`` ``>``"

.. code-block:: typescript

   const hiddenLabelIds = useRecoilValue(fos.hiddenLabelIds);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hiddenLabels:

hiddenLabels
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "hiddenLabels",":js:class:`fiftyone.state.SelectedLabelMap`"

.. code-block:: typescript

   const [hiddenLabels, setHiddenLabels] = useRecoilState(fos.hiddenLabels);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hiddenLabelsArray:

hiddenLabelsArray
~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const hiddenLabelsArray = useRecoilValue(fos.hiddenLabelsArray);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hoveredSample:

hoveredSample
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "hoveredSample",":js:class:`fiftyone.state.Sample`"

.. code-block:: typescript

   const [hoveredSample, setHoveredSample] = useRecoilState(fos.hoveredSample);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isClipsView:

isClipsView
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isClipsView","``boolean``"

.. code-block:: typescript

   const isClipsView = useRecoilValue(fos.isClipsView);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isFramesView:

isFramesView
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isFramesView","``boolean``"

.. code-block:: typescript

   const isFramesView = useRecoilValue(fos.isFramesView);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isGroup:

isGroup
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isGroup","``boolean``"

.. code-block:: typescript

   const isGroup = useRecoilValue(fos.isGroup);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isLargeVideo:

isLargeVideo
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isLargeVideo","``boolean``"

.. code-block:: typescript

   const isLargeVideo = useRecoilValue(fos.isLargeVideo);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isNotebook:

isNotebook
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isNotebook","``boolean``"

.. code-block:: typescript

   const isNotebook = useRecoilValue(fos.isNotebook);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isPatchesView:

isPatchesView
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isPatchesView","``boolean``"

.. code-block:: typescript

   const isPatchesView = useRecoilValue(fos.isPatchesView);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isRootView:

isRootView
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isRootView","``boolean``"

.. code-block:: typescript

   const isRootView = useRecoilValue(fos.isRootView);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isVideoDataset:

isVideoDataset
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isVideoDataset","``boolean``"

.. code-block:: typescript

   const isVideoDataset = useRecoilValue(fos.isVideoDataset);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.loading:

loading
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "loading","``boolean``"

.. code-block:: typescript

   const [loading, setLoading] = useRecoilState(fos.loading);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.lookerPanels:

lookerPanels
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "lookerPanels.help","``Object``"
  "lookerPanels.json","``Object``"

.. code-block:: typescript

   const [lookerPanels, setLookerPanels] = useRecoilState(fos.lookerPanels);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.mainGroupSample:

mainGroupSample
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "mainGroupSample",":js:class:`fiftyone.state.AppSample`"

.. code-block:: typescript

   const mainGroupSample = useRecoilValue(fos.mainGroupSample);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.mediaFields:

mediaFields
~~~~~~~~~~~

.. code-block:: typescript

   const mediaFields = useRecoilValue(fos.mediaFields);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.mediaType:

mediaType
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "mediaType","``Union<`` ``'image'`` ``,`` ``'group'`` ``,`` ``'point_cloud'`` ``,`` ``'video'`` ``>``"

.. code-block:: typescript

   const mediaType = useRecoilValue(fos.mediaType);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.modal:

modal
~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "modal",":js:class:`fiftyone.state.ModalSample`"

.. code-block:: typescript

   const [modal, setModal] = useRecoilState(fos.modal);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.modalFilters:

modalFilters
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "modalFilters",":js:class:`fiftyone.state.Filters`"

.. code-block:: typescript

   const [modalFilters, setModalFilters] = useRecoilState(fos.modalFilters);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.modalNavigation:

modalNavigation
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "modalNavigation",":js:class:`fiftyone.state.ModalNavigation`"

.. code-block:: typescript

   const modalNavigation = useRecoilValue(fos.modalNavigation);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.modalTopBarVisible:

modalTopBarVisible
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "modalTopBarVisible","``boolean``"

.. code-block:: typescript

   const [modalTopBarVisible, setModalTopBarVisible] = useRecoilState(fos.modalTopBarVisible);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.patching:

patching
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "patching","``boolean``"

.. code-block:: typescript

   const [patching, setPatching] = useRecoilState(fos.patching);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pathHiddenLabelsMap:

pathHiddenLabelsMap
~~~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const [pathHiddenLabelsMap, setPathHiddenLabelsMap] = useRecoilState(fos.pathHiddenLabelsMap);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pinnedSlice:

pinnedSlice
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "pinnedSlice","``string``"

.. code-block:: typescript

   const pinnedSlice = useRecoilValue(fos.pinnedSlice);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pinnedSliceSample:

pinnedSliceSample
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "pinnedSliceSample.id","``string``"
  "pinnedSliceSample.sample","``object``"
  "pinnedSliceSample.urls","``readonly``"

.. code-block:: typescript

   const [pinnedSliceSample, setPinnedSliceSample] = useRecoilState(fos.pinnedSliceSample);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.readOnly:

readOnly
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "readOnly","``boolean``"

.. code-block:: typescript

   const [readOnly, setReadOnly] = useRecoilState(fos.readOnly);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.refreshGroupQuery:

refreshGroupQuery
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "refreshGroupQuery","``number``"

.. code-block:: typescript

   const [refreshGroupQuery, setRefreshGroupQuery] = useRecoilState(fos.refreshGroupQuery);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.refresher:

refresher
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "refresher","``number``"

.. code-block:: typescript

   const [refresher, setRefresher] = useRecoilState(fos.refresher);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.rootElementName:

rootElementName
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "rootElementName","``string``"

.. code-block:: typescript

   const rootElementName = useRecoilValue(fos.rootElementName);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.rootElementNamePlural:

rootElementNamePlural
~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "rootElementNamePlural","``string``"

.. code-block:: typescript

   const rootElementNamePlural = useRecoilValue(fos.rootElementNamePlural);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.savedLookerOptions:

savedLookerOptions
~~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const [savedLookerOptions, setSavedLookerOptions] = useRecoilState(fos.savedLookerOptions);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.savedViewsSelector:

savedViewsSelector
~~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const savedViewsSelector = useRecoilValue(fos.savedViewsSelector);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.savingFilters:

savingFilters
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "savingFilters","``boolean``"

.. code-block:: typescript

   const [savingFilters, setSavingFilters] = useRecoilState(fos.savingFilters);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedLabelIds:

selectedLabelIds
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "selectedLabelIds","``Set < string >`` ``<`` ``string`` ``>``"

.. code-block:: typescript

   const selectedLabelIds = useRecoilValue(fos.selectedLabelIds);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedLabelList:

selectedLabelList
~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const selectedLabelList = useRecoilValue(fos.selectedLabelList);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedLabels:

selectedLabels
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "selectedLabels",":js:class:`fiftyone.state.SelectedLabelMap`"

.. code-block:: typescript

   const [selectedLabels, setSelectedLabels] = useRecoilState(fos.selectedLabels);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedSamples:

selectedSamples
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "selectedSamples","``Set < string >`` ``<`` ``string`` ``>``"

.. code-block:: typescript

   const [selectedSamples, setSelectedSamples] = useRecoilState(fos.selectedSamples);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedViewName:

selectedViewName
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "selectedViewName","``string``"

.. code-block:: typescript

   const [selectedViewName, setSelectedViewName] = useRecoilState(fos.selectedViewName);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.showOverlays:

showOverlays
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "showOverlays","``boolean``"

.. code-block:: typescript

   const [showOverlays, setShowOverlays] = useRecoilState(fos.showOverlays);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarOverride:

sidebarOverride
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "sidebarOverride","``string``"

.. code-block:: typescript

   const [sidebarOverride, setSidebarOverride] = useRecoilState(fos.sidebarOverride);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarSampleId:

sidebarSampleId
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "sidebarSampleId","``string``"

.. code-block:: typescript

   const sidebarSampleId = useRecoilValue(fos.sidebarSampleId);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.similarityKeys:

similarityKeys
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "similarityKeys.patches","``Array<`` ``[`` ``string`` ``,`` ``string`` ``]`` ``>``"
  "similarityKeys.samples","``Array<`` ``string`` ``>``"

.. code-block:: typescript

   const similarityKeys = useRecoilValue(fos.similarityKeys);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.similarityParameters:

similarityParameters
~~~~~~~~~~~~~~~~~~~~

.. code-block:: typescript

   const [similarityParameters, setSimilarityParameters] = useRecoilState(fos.similarityParameters);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.similaritySorting:

similaritySorting
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "similaritySorting","``boolean``"

.. code-block:: typescript

   const [similaritySorting, setSimilaritySorting] = useRecoilState(fos.similaritySorting);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stageInfo:

stageInfo
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "stageInfo","``any``"

.. code-block:: typescript

   const [stageInfo, setStageInfo] = useRecoilState(fos.stageInfo);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stateSubscription:

stateSubscription
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "stateSubscription","``string``"

.. code-block:: typescript

   const stateSubscription = useRecoilValue(fos.stateSubscription);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.targets:

targets
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "targets.defaults",":js:class:`fiftyone.state.Targets`"
  "targets.fields","``Any``"

.. code-block:: typescript

   const targets = useRecoilValue(fos.targets);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.teams:

teams
~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "teams.minimized","``boolean``"
  "teams.open","``boolean``"
  "teams.submitted","``boolean``"

.. code-block:: typescript

   const [teams, setTeams] = useRecoilState(fos.teams);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.theme:

theme
~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "theme","``Union<`` ``'dark'`` ``,`` ``'light'`` ``>``"

.. code-block:: typescript

   const [theme, setTheme] = useRecoilState(fos.theme);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.timeZone:

timeZone
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "timeZone","``string``"

.. code-block:: typescript

   const timeZone = useRecoilValue(fos.timeZone);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.view:

view
~~~~

.. code-block:: typescript

   const [view, setView] = useRecoilState(fos.view);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.viewCls:

viewCls
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "viewCls","``string``"

.. code-block:: typescript

   const [viewCls, setViewCls] = useRecoilState(fos.viewCls);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.viewCounter:

viewCounter
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "viewCounter","``number``"

.. code-block:: typescript

   const [viewCounter, setViewCounter] = useRecoilState(fos.viewCounter);

.. _fos.@fiftyone/fiftyone.@fiftyone/state.viewName:

viewName
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "viewName","``string``"

.. code-block:: typescript

   const [viewName, setViewName] = useRecoilState(fos.viewName);

Hooks
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useBeforeScreenshot:

useBeforeScreenshot
~~~~~~~~~~~~~~~~~~~

.. js:function:: useBeforeScreenshot(cb)


   :param cb:
   :type cb: ( )
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useClearModal:

useClearModal
~~~~~~~~~~~~~

.. js:function:: useClearModal()


A react hook that allows clearing the modal state.

**Example**

.. code-block:: typescript

   function MyComponent() {
     const clearModal = useClearModal();
     return (
      <button onClick={clearModal}>Close Modal</button>
     )
   }

**Returns**

A function that clears the modal state.

         .. js:function:: clearModal


            :param args:
            :type args: [ ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useCreateLooker:

useCreateLooker
~~~~~~~~~~~~~~~

.. js:function:: useCreateLooker(isModal, thumbnail, options, highlight)


   :param isModal:
   :param thumbnail:
   :param options:
   :param highlight:
   :type isModal: boolean
   :type thumbnail: boolean
   :type options: Omit < ReturnType ,  >
   :type highlight: boolean
   :rtype: ``MutableRefObject <  >`` ``<`` ``( data : SampleData )`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useEntries:

useEntries
~~~~~~~~~~

.. js:function:: useEntries(modal)


   :param modal:
   :type modal: boolean
   :rtype: ``[`` ``Array< SidebarEntry >`` ``,`` ``( entries :  )`` ``]``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useEventHandler:

useEventHandler
~~~~~~~~~~~~~~~

.. js:function:: useEventHandler(target, eventType, handler, useCapture)


   :param target:
   :param eventType:
   :param handler:
   :param useCapture:
   :type target: any
   :type eventType: any
   :type handler: any
   :type useCapture: boolean
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useExpandSample:

useExpandSample
~~~~~~~~~~~~~~~

.. js:function:: useExpandSample()


         .. js:function:: expandSample


            :param args:
            :type args: [ sample , navigation ]
            :rtype: ``Promise < void >`` ``<`` ``void`` ``>``

Returns a function that will run the callback that was passed when
calling this hook. Useful for accessing Recoil state in response to
events.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useFollow:

useFollow
~~~~~~~~~

.. js:function:: useFollow(leaderRef, followerRef, set)


   :param leaderRef:
   :param followerRef:
   :param set:
   :type leaderRef: any
   :type followerRef: any
   :type set: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useHashChangeHandler:

useHashChangeHandler
~~~~~~~~~~~~~~~~~~~~

.. js:function:: useHashChangeHandler(handler)


   :param handler:
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useHelpPanel:

useHelpPanel
~~~~~~~~~~~~

.. js:function:: useHelpPanel()

   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useHover:

useHover
~~~~~~~~

.. js:function:: useHover()

   :rtype: ``[`` ``MutableRefObject < any >`` ``,`` ``boolean`` ``]``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useHoveredSample:

useHoveredSample
~~~~~~~~~~~~~~~~

.. js:function:: useHoveredSample(sample, auxHandlers)


   :param sample:
   :param auxHandlers:
   :type sample: AppSample
   :type auxHandlers: any
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useJSONPanel:

useJSONPanel
~~~~~~~~~~~~

.. js:function:: useJSONPanel()

   :rtype: ``Object``

Manage the JSON panel state and events.

**Example**

.. code-block:: typescript

   function MyComponent() {
     const jsonPanel = useJSONPanel();
   
     return jsonPanel.isOpen && (
        <JSONPanel
          containerRef={jsonPanel.containerRef}
          jsonHTML={jsonPanel.jsonHTML}
          onClose={() => jsonPanel.close()}
          onCopy={() => jsonPanel.copy()}
        />
      )
   }

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useKeydownHandler:

useKeydownHandler
~~~~~~~~~~~~~~~~~

.. js:function:: useKeydownHandler(handler)


   :param handler:
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useLabelTagText:

useLabelTagText
~~~~~~~~~~~~~~~

.. js:function:: useLabelTagText(modal)


   :param modal:
   :type modal: boolean
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useLookerOptions:

useLookerOptions
~~~~~~~~~~~~~~~~

.. js:function:: useLookerOptions(modal)


   :param modal:
   :type modal: boolean
   :rtype: ``Partial < Omit >`` ``<`` ``Omit <  ,  >`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useLookerStore:

useLookerStore
~~~~~~~~~~~~~~

.. js:function:: useLookerStore()

   :rtype: :js:class:`fiftyone.state.LookerStore` ``<`` :js:class:`fiftyone.state.Lookers` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useObserve:

useObserve
~~~~~~~~~~

.. js:function:: useObserve(target, handler)


   :param target:
   :param handler:
   :type target: any
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useOnSelectLabel:

useOnSelectLabel
~~~~~~~~~~~~~~~~

.. js:function:: useOnSelectLabel()


         .. js:function:: onSelectLabel


            :param args:
            :type args: [ SelectEvent ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useOutsideClick:

useOutsideClick
~~~~~~~~~~~~~~~

.. js:function:: useOutsideClick(ref, handler)


   :param ref:
   :param handler:
   :type ref: any
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.usePanel:

usePanel
~~~~~~~~

.. js:function:: usePanel(name, atom)


   :param name:
   :param atom:
   :type name: any
   :type atom: any
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useQueryState:

useQueryState
~~~~~~~~~~~~~

.. js:function:: useQueryState(query)


   :param query:
   :type query: any
   :rtype: ``Array<`` ``Union<`` ``string`` ``,`` ``Array< string >`` ``,`` ``ParsedQs`` ``,`` ``Array< ParsedQs >`` ``,`` ``( value : any )`` ``>`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useRefresh:

useRefresh
~~~~~~~~~~

.. js:function:: useRefresh()


         .. js:function:: refresh


            :param args:
            :type args: [ ]
            :rtype: ``void``

Returns a function that will run the callback that was passed when
calling this hook. Useful for accessing Recoil state in response to
events.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useReset:

useReset
~~~~~~~~

.. js:function:: useReset()


         .. js:function:: reset


            :param args:
            :type args: [ ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useResizeHandler:

useResizeHandler
~~~~~~~~~~~~~~~~

.. js:function:: useResizeHandler(handler)


   :param handler:
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useRouter:

useRouter
~~~~~~~~~

.. js:function:: useRouter(makeRoutes, deps)


   :param makeRoutes:
   :param deps:
   :type makeRoutes: ( environment : default )
   :type deps: DependencyList
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSavedViews:

useSavedViews
~~~~~~~~~~~~~

.. js:function:: useSavedViews()

   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useScreenshot:

useScreenshot
~~~~~~~~~~~~~

.. js:function:: useScreenshot(context)


   :param context:
   :type context: Union<  ,  ,  >

         .. js:function:: screenshot

            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useScrollHandler:

useScrollHandler
~~~~~~~~~~~~~~~~

.. js:function:: useScrollHandler(handler)


   :param handler:
   :type handler: any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSelectFlashlightSample:

useSelectFlashlightSample
~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: useSelectFlashlightSample()


         .. js:function:: selectFlashlightSample


            :param args:
            :type args: [ default , SelectThumbnailData ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSelectSample:

useSelectSample
~~~~~~~~~~~~~~~

.. js:function:: useSelectSample()


         .. js:function:: selectSample


            :param args:
            :type args: [ sampleId ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSendEvent:

useSendEvent
~~~~~~~~~~~~

.. js:function:: useSendEvent(force)


   :param force:
   :type force: boolean

         .. js:function:: sendEvent


            :param send:
            :type send: ( session : string )
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetDataset:

useSetDataset
~~~~~~~~~~~~~

.. js:function:: useSetDataset()


         .. js:function:: setDataset


            :param name:
            :type name: string
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetExpandedSample:

useSetExpandedSample
~~~~~~~~~~~~~~~~~~~~

.. js:function:: useSetExpandedSample(withGroup)


   :param withGroup:
   :type withGroup: boolean

         .. js:function:: setExpandedSample


            :param args:
            :type args: [ sample , navigation ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetExtendedSelection:

useSetExtendedSelection
~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: useSetExtendedSelection()


         .. js:function:: setExtendedSelection


            :param selected:
            :type selected: Array< string >
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetGroupSlice:

useSetGroupSlice
~~~~~~~~~~~~~~~~

.. js:function:: useSetGroupSlice()


         .. js:function:: setGroupSlice


            :param args:
            :type args: [ slice ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetSelected:

useSetSelected
~~~~~~~~~~~~~~

.. js:function:: useSetSelected()


         .. js:function:: setSelected


            :param selected:
            :type selected: Array< string >
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetSelectedLabels:

useSetSelectedLabels
~~~~~~~~~~~~~~~~~~~~

.. js:function:: useSetSelectedLabels()


         .. js:function:: setSelectedLabels


            :param selectedLabels:
            :type selectedLabels: Array< SelectedLabel >
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useSetView:

useSetView
~~~~~~~~~~

.. js:function:: useSetView(patch, selectSlice, onComplete)


   :param patch:
   :param selectSlice:
   :param onComplete:
   :type patch: boolean
   :type selectSlice: boolean
   :type onComplete: ( )

         .. js:function:: setView


            :param args:
            :type args: [ viewOrUpdater , addStages , viewName , changingSavedView , savedViewSlug ]
            :rtype: ``void``

Returns a function that will run the callback that was passed when
calling this hook. Useful for accessing Recoil state in response to
events.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useStateUpdate:

useStateUpdate
~~~~~~~~~~~~~~

.. js:function:: useStateUpdate()


         .. js:function:: stateUpdate


            :param args:
            :type args: [ resolve ]
            :rtype: ``void``

Returns a function that executes an atomic transaction for updating Recoil state.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useTagText:

useTagText
~~~~~~~~~~

.. js:function:: useTagText(modal)


   :param modal:
   :type modal: boolean
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useTo:

useTo
~~~~~

.. js:function:: useTo(state)


   :param state:
   :type state: any
   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useTooltip:

useTooltip
~~~~~~~~~~

.. js:function:: useTooltip()

   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useUnprocessedStateUpdate:

useUnprocessedStateUpdate
~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: useUnprocessedStateUpdate()


         .. js:function:: unprocessedStateUpdate


            :param resolve:
            :type resolve: StateResolver
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useUpdateSample:

useUpdateSample
~~~~~~~~~~~~~~~

.. js:function:: useUpdateSample()


         .. js:function:: updateSample


            :param sample:
            :type sample: AppSample
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.useWindowSize:

useWindowSize
~~~~~~~~~~~~~

.. js:function:: useWindowSize()

   :rtype: ``Object``

Functions
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeField:

activeField
~~~~~~~~~~~

.. js:function:: activeField(params)


   :param params:
   :param params.modal: Whether the field is in a modal or not
   :param params.path: The path of the field
   :type params: Object
   :type params.modal: boolean
   :type params.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Get or set the active state of a field.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeFields:

activeFields
~~~~~~~~~~~~

.. js:function:: activeFields(param)


   :param param:
   :param param.modal:
   :type param: Object
   :type param.modal: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeLabelFields:

activeLabelFields
~~~~~~~~~~~~~~~~~

.. js:function:: activeLabelFields(param)


   :param param:
   :param param.modal:
   :param param.space:
   :type param: Object
   :type param.modal: boolean
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeLabelPaths:

activeLabelPaths
~~~~~~~~~~~~~~~~

.. js:function:: activeLabelPaths(param)


   :param param:
   :param param.modal:
   :param param.space:
   :type param: Object
   :type param.modal: boolean
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeLabelTags:

activeLabelTags
~~~~~~~~~~~~~~~

.. js:function:: activeLabelTags(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.activeTags:

activeTags
~~~~~~~~~~

.. js:function:: activeTags(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.aggregation:

aggregation
~~~~~~~~~~~

.. js:function:: aggregation(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.aggregationQuery:

aggregationQuery
~~~~~~~~~~~~~~~~

.. js:function:: aggregationQuery(parameter)


   :param parameter:
   :param parameter.extended:
   :param parameter.modal:
   :param parameter.paths:
   :param parameter.root:
   :type parameter: Object
   :type parameter.extended: boolean
   :type parameter.modal: boolean
   :type parameter.paths: Array< string >
   :type parameter.root: boolean
   :rtype: ``RecoilState < aggregationsQuery$data >`` ``<`` :js:class:`fiftyone.state.aggregationsQuery$data` ``>``

GraphQL Selector Family for Aggregations.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.aggregations:

aggregations
~~~~~~~~~~~~

.. js:function:: aggregations(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.paths:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.paths: Array< string >
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``readonly`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.alpha:

alpha
~~~~~

.. js:function:: alpha(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.appConfigOption:

appConfigOption
~~~~~~~~~~~~~~~

.. js:function:: appConfigOption(param)


   :param param:
   :param param.key:
   :param param.modal:
   :type param: Object
   :type param.key: string
   :type param.modal: boolean
   :rtype: ``RecoilState < any >`` ``<`` ``any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.boolean:

boolean
~~~~~~~

.. js:function:: boolean(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``( value : boolean )`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.booleanCountResults:

booleanCountResults
~~~~~~~~~~~~~~~~~~~

.. js:function:: booleanCountResults(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Object`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.booleanFieldIsFiltered:

booleanFieldIsFiltered
~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: booleanFieldIsFiltered(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.booleanSelectedValuesAtom:

booleanSelectedValuesAtom
~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: booleanSelectedValuesAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState <  >`` ``<`` ``Array< boolean >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.boundedCount:

boundedCount
~~~~~~~~~~~~

.. js:function:: boundedCount(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.bounds:

bounds
~~~~~~

.. js:function:: bounds(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``[ number , number ]`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.boundsAtom:

boundsAtom
~~~~~~~~~~

.. js:function:: boundsAtom(param)


   :param param:
   :param param.defaultRange:
   :param param.path:
   :type param: Object
   :type param.defaultRange: Range
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < Range >`` ``<`` :js:class:`fiftyone.state.Range` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.buildSchema:

buildSchema
~~~~~~~~~~~

.. js:function:: buildSchema(dataset)


   :param dataset:
   :type dataset: Dataset
   :rtype: :js:class:`fiftyone.state.Schema`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.collapseFields:

collapseFields
~~~~~~~~~~~~~~

.. js:function:: collapseFields(paths)


   :param paths:
   :type paths: any
   :rtype: ``Array<`` :js:class:`fiftyone.state.StrictField` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.colorMap:

colorMap
~~~~~~~~

.. js:function:: colorMap(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``( val : any )`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.colorSeed:

colorSeed
~~~~~~~~~

.. js:function:: colorSeed(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.coloring:

coloring
~~~~~~~~

.. js:function:: coloring(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < Coloring >`` ``<`` :js:class:`fiftyone.state.Coloring` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.configuredSidebarModeDefault:

configuredSidebarModeDefault
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: configuredSidebarModeDefault(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.count:

count
~~~~~

.. js:function:: count(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :param param.value:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :type param.value: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.countValues:

countValues
~~~~~~~~~~~

.. js:function:: countValues(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.counts:

counts
~~~~~~

.. js:function:: counts(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.createRouter:

createRouter
~~~~~~~~~~~~

.. js:function:: createRouter(environment, routes, __namedParameters)


   :param environment:
   :param routes:
   :param __namedParameters:
   :param __namedParameters.errors:
   :type environment: default
   :type routes: Array< RouteDefinition < OperationType > >
   :type __namedParameters: Object
   :type __namedParameters.errors: boolean
   :rtype: :js:class:`fiftyone.state.Router` ``<`` ``any`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.cropToContent:

cropToContent
~~~~~~~~~~~~~

.. js:function:: cropToContent(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.cumulativeCounts:

cumulativeCounts
~~~~~~~~~~~~~~~~

.. js:function:: cumulativeCounts(param)


   :param param:
   :param param.embeddedDocType:
   :param param.extended:
   :param param.ftype:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.embeddedDocType: Union< string ,  >
   :type param.extended: boolean
   :type param.ftype: Union< string ,  >
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.cumulativeValues:

cumulativeValues
~~~~~~~~~~~~~~~~

.. js:function:: cumulativeValues(param)


   :param param:
   :param param.embeddedDocType:
   :param param.extended:
   :param param.ftype:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.embeddedDocType: Union< string ,  >
   :type param.extended: boolean
   :type param.ftype: Union< string ,  >
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.currentSlice:

currentSlice
~~~~~~~~~~~~

.. js:function:: currentSlice(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.deferrer:

deferrer
~~~~~~~~

.. js:function:: deferrer(initialized)


   :param initialized:
   :type initialized: MutableRefObject < boolean >

         .. js:function:: deferrer(initialized)


            :param fn:
            :type fn: ( args :  )

         .. js:function:: deferrer(initialized)


            :param args:
            :type args: Array< any >
            :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.distribution:

distribution
~~~~~~~~~~~~

.. js:function:: distribution(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  ,  ,  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.distributionPaths:

distributionPaths
~~~~~~~~~~~~~~~~~

.. js:function:: distributionPaths(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.excludeAtom:

excludeAtom
~~~~~~~~~~~

.. js:function:: excludeAtom(param)


   :param param:
   :param param.defaultRange:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.defaultRange: Range
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.expandPath:

expandPath
~~~~~~~~~~

.. js:function:: expandPath(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.falseAtom:

falseAtom
~~~~~~~~~

.. js:function:: falseAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.field:

field
~~~~~

.. js:function:: field(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < Field >`` ``<`` :js:class:`fiftyone.state.Field` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fieldIsFiltered:

fieldIsFiltered
~~~~~~~~~~~~~~~

.. js:function:: fieldIsFiltered(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fieldPaths:

fieldPaths
~~~~~~~~~~

.. js:function:: fieldPaths(param)


   :param param:
   :param param.embeddedDocType:
   :param param.ftype:
   :param param.path:
   :param param.space:
   :type param: Object
   :type param.embeddedDocType: Union< string ,  >
   :type param.ftype: Union< string ,  >
   :type param.path: string
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fieldSchema:

fieldSchema
~~~~~~~~~~~

.. js:function:: fieldSchema(param)


   :param param:
   :param param.space:
   :type param: Object
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < Schema >`` ``<`` :js:class:`fiftyone.state.Schema` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fieldType:

fieldType
~~~~~~~~~

.. js:function:: fieldType(param)


   :param param:
   :param param.path:
   :param param.useListSubfield:
   :type param: Object
   :type param.path: string
   :type param.useListSubfield: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.fields:

fields
~~~~~~

.. js:function:: fields(param)


   :param param:
   :param param.embeddedDocType:
   :param param.ftype:
   :param param.path:
   :param param.space:
   :type param: Object
   :type param.embeddedDocType: Union< string ,  >
   :type param.ftype: Union< string ,  >
   :type param.path: string
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< Field >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.filter:

filter
~~~~~~

.. js:function:: filter(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < Filter >`` ``<`` :js:class:`fiftyone.state.Filter` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.filterFields:

filterFields
~~~~~~~~~~~~

.. js:function:: filterFields(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.filterPaths:

filterPaths
~~~~~~~~~~~

.. js:function:: filterPaths(paths, schema)


   :param paths:
   :param schema:
   :type paths: Array< string >
   :type schema: Schema
   :rtype: ``Array<`` ``string`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.filterView:

filterView
~~~~~~~~~~

.. js:function:: filterView(stages)


   :param stages:
   :type stages: any
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getDatasetName:

getDatasetName
~~~~~~~~~~~~~~

.. js:function:: getDatasetName(context)


   :param context:
   :type context: RoutingContext < any >
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getEnvironment:

getEnvironment
~~~~~~~~~~~~~~

.. js:function:: getEnvironment()

   :rtype: ``default``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getSample:

getSample
~~~~~~~~~

.. js:function:: getSample(id)


   :param id:
   :type id: string
   :rtype: :js:class:`fiftyone.state.SampleData`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getSampleSrc:

getSampleSrc
~~~~~~~~~~~~

.. js:function:: getSampleSrc(url)


   :param url:
   :type url: string
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.getSavedViewName:

getSavedViewName
~~~~~~~~~~~~~~~~

.. js:function:: getSavedViewName(context)


   :param context:
   :type context: RoutingContext < any >
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupIsEmpty:

groupIsEmpty
~~~~~~~~~~~~

.. js:function:: groupIsEmpty(param)


   :param param:
   :param param.group:
   :param param.modal:
   :type param: Object
   :type param.group: string
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupShown:

groupShown
~~~~~~~~~~

.. js:function:: groupShown(param)


   :param param:
   :param param.group:
   :param param.loading:
   :param param.modal:
   :type param: Object
   :type param.group: string
   :type param.loading: boolean
   :type param.modal: boolean
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupSlice:

groupSlice
~~~~~~~~~~

.. js:function:: groupSlice(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.groupStatistics:

groupStatistics
~~~~~~~~~~~~~~~

.. js:function:: groupStatistics(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Union<  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hasFilters:

hasFilters
~~~~~~~~~~

.. js:function:: hasFilters(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.hiddenFieldLabels:

hiddenFieldLabels
~~~~~~~~~~~~~~~~~

.. js:function:: hiddenFieldLabels(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.histogramValues:

histogramValues
~~~~~~~~~~~~~~~

.. js:function:: histogramValues(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.imageFilters:

imageFilters
~~~~~~~~~~~~

.. js:function:: imageFilters(param)


   :param param:
   :param param.filter:
   :param param.modal:
   :type param: Object
   :type param.filter: string
   :type param.modal: boolean
   :rtype: ``RecoilState < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.isDefaultRange:

isDefaultRange
~~~~~~~~~~~~~~

.. js:function:: isDefaultRange(param)


   :param param:
   :param param.defaultRange:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.defaultRange: Range
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.labelCount:

labelCount
~~~~~~~~~~

.. js:function:: labelCount(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.labelFields:

labelFields
~~~~~~~~~~~

.. js:function:: labelFields(param)


   :param param:
   :param param.space:
   :type param: Object
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.labelPath:

labelPath
~~~~~~~~~

.. js:function:: labelPath(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.labelPaths:

labelPaths
~~~~~~~~~~

.. js:function:: labelPaths(param)


   :param param:
   :param param.expanded:
   :param param.space:
   :type param: Object
   :type param.expanded: boolean
   :type param.space: SPACE
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.labelTagCounts:

labelTagCounts
~~~~~~~~~~~~~~

.. js:function:: labelTagCounts(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.lookerOptions:

lookerOptions
~~~~~~~~~~~~~

.. js:function:: lookerOptions(param)


   :param param:
   :param param.modal:
   :param param.withFilter:
   :type param: Object
   :type param.modal: boolean
   :type param.withFilter: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < Partial >`` ``<`` ``Partial < Omit >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.makeRouteDefinitions:

makeRouteDefinitions
~~~~~~~~~~~~~~~~~~~~

.. js:function:: makeRouteDefinitions(environment, children)


   :param environment:
   :param children:
   :type environment: Environment
   :type children: Array< RouteOptions < T > >
   :rtype: ``Array<`` :js:class:`fiftyone.state.RouteDefinition` ``<`` :js:class:`fiftyone.state.T` ``>`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.matchPath:

matchPath
~~~~~~~~~

.. js:function:: matchPath(pathname, options, variables)


   :param pathname:
   :param options:
   :param variables:
   :type pathname: string
   :type options: MatchPathOptions
   :type variables: Partial < VariablesOf >
   :rtype: :js:class:`fiftyone.state.MatchPathResult` ``<`` :js:class:`fiftyone.state.T` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.matchRoutes:

matchRoutes
~~~~~~~~~~~

.. js:function:: matchRoutes(routes, pathname, variables, branch)


   :param routes:
   :param pathname:
   :param variables:
   :param branch:
   :type routes: Array< RouteBase < T > >
   :type pathname: string
   :type variables:
   :type branch: Array< Object >
   :rtype: ``Array<`` ``Object`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.matchedTags:

matchedTags
~~~~~~~~~~~

.. js:function:: matchedTags(param)


   :param param:
   :param param.key:
   :param param.modal:
   :type param: Object
   :type param.key: TagKey
   :type param.modal: boolean
   :rtype: ``RecoilState < Set >`` ``<`` ``Set < string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.meetsType:

meetsType
~~~~~~~~~

.. js:function:: meetsType(param)


   :param param:
   :param param.acceptLists:
   :param param.embeddedDocType:
   :param param.ftype:
   :param param.path:
   :param param.under:
   :type param: Object
   :type param.acceptLists: boolean
   :type param.embeddedDocType: Union< string ,  >
   :type param.ftype: Union< string ,  >
   :type param.path: string
   :type param.under: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.noDistributionPathsData:

noDistributionPathsData
~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: noDistributionPathsData(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.noneAtom:

noneAtom
~~~~~~~~

.. js:function:: noneAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.noneCount:

noneCount
~~~~~~~~~

.. js:function:: noneCount(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.nonfiniteAtom:

nonfiniteAtom
~~~~~~~~~~~~~

.. js:function:: nonfiniteAtom(param)


   :param param:
   :param param.key:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.key: Union<  ,  ,  ,  >
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.nonfiniteCount:

nonfiniteCount
~~~~~~~~~~~~~~

.. js:function:: nonfiniteCount(param)


   :param param:
   :param param.extended:
   :param param.key:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.key: Nonfinite
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.nonfiniteCounts:

nonfiniteCounts
~~~~~~~~~~~~~~~

.. js:function:: nonfiniteCounts(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Object`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.numeric:

numeric
~~~~~~~

.. js:function:: numeric(param)


   :param param:
   :param param.defaultRange:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.defaultRange: Range
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``( value : number )`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.numericFieldIsFiltered:

numericFieldIsFiltered
~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: numericFieldIsFiltered(param)


   :param param:
   :param param.defaultRange:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.defaultRange: Range
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pathColor:

pathColor
~~~~~~~~~

.. js:function:: pathColor(param)


   :param param:
   :param param.modal:
   :param param.path:
   :param param.tag:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :type param.tag: TagKey
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pathFilter:

pathFilter
~~~~~~~~~~

.. js:function:: pathFilter(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``( path : string ,  value : any )`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.pathIsShown:

pathIsShown
~~~~~~~~~~~

.. js:function:: pathIsShown(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.persistSidebarGroups:

persistSidebarGroups
~~~~~~~~~~~~~~~~~~~~

.. js:function:: persistSidebarGroups(variables)


   :param variables:
   :type variables: setSidebarGroupsMutation$variables
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.rangeAtom:

rangeAtom
~~~~~~~~~

.. js:function:: rangeAtom(param)


   :param param:
   :param param.defaultRange:
   :param param.modal:
   :param param.path:
   :param param.withBounds:
   :type param: Object
   :type param.defaultRange: Range
   :type param.modal: boolean
   :type param.path: string
   :type param.withBounds: boolean
   :rtype: ``RecoilState < Range >`` ``<`` :js:class:`fiftyone.state.Range` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.readableTags:

readableTags
~~~~~~~~~~~~

.. js:function:: readableTags(param)


   :param param:
   :param param.group:
   :param param.modal:
   :type param: Object
   :type param.group: Union<  ,  >
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.resolveGroups:

resolveGroups
~~~~~~~~~~~~~

.. js:function:: resolveGroups(dataset, current)


   :param dataset:
   :param current:
   :type dataset: Dataset
   :type current: Array< SidebarGroup >
   :rtype: ``Array<`` :js:class:`fiftyone.state.SidebarGroup` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.resolvedGroupSlice:

resolvedGroupSlice
~~~~~~~~~~~~~~~~~~

.. js:function:: resolvedGroupSlice(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.resolvedSidebarMode:

resolvedSidebarMode
~~~~~~~~~~~~~~~~~~~

.. js:function:: resolvedSidebarMode(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Union<  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sampleTagCounts:

sampleTagCounts
~~~~~~~~~~~~~~~

.. js:function:: sampleTagCounts(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.schemaReduce:

schemaReduce
~~~~~~~~~~~~

.. js:function:: schemaReduce(schema, field)


   :param schema:
   :param field:
   :type schema: Schema
   :type field: StrictField
   :rtype: :js:class:`fiftyone.state.Schema`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.selectedMediaField:

selectedMediaField
~~~~~~~~~~~~~~~~~~

.. js:function:: selectedMediaField(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.setCurrentEnvironment:

setCurrentEnvironment
~~~~~~~~~~~~~~~~~~~~~

.. js:function:: setCurrentEnvironment(environment)


   :param environment:
   :type environment: default
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarEntries:

sidebarEntries
~~~~~~~~~~~~~~

.. js:function:: sidebarEntries(param)


   :param param:
   :param param.filtered:
   :param param.loading:
   :param param.modal:
   :type param: Object
   :type param.filtered: boolean
   :type param.loading: boolean
   :type param.modal: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< SidebarEntry >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarGroup:

sidebarGroup
~~~~~~~~~~~~

.. js:function:: sidebarGroup(param)


   :param param:
   :param param.filtered:
   :param param.group:
   :param param.loading:
   :param param.modal:
   :type param: Object
   :type param.filtered: boolean
   :type param.group: string
   :type param.loading: boolean
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarGroupMapping:

sidebarGroupMapping
~~~~~~~~~~~~~~~~~~~

.. js:function:: sidebarGroupMapping(param)


   :param param:
   :param param.filtered:
   :param param.loading:
   :param param.modal:
   :type param: Object
   :type param.filtered: boolean
   :type param.loading: boolean
   :type param.modal: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Any`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarGroupNames:

sidebarGroupNames
~~~~~~~~~~~~~~~~~

.. js:function:: sidebarGroupNames(param)


   :param param:
   :type param: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarGroups:

sidebarGroups
~~~~~~~~~~~~~

.. js:function:: sidebarGroups(param)


   :param param:
   :param param.filtered:
   :param param.loading:
   :param param.modal:
   :param param.persist:
   :type param: Object
   :type param.filtered: boolean
   :type param.loading: boolean
   :type param.modal: boolean
   :type param.persist: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< SidebarGroup >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarGroupsDefinition:

sidebarGroupsDefinition
~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: sidebarGroupsDefinition(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Array< SidebarGroup >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarMode:

sidebarMode
~~~~~~~~~~~

.. js:function:: sidebarMode(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState <  >`` ``<`` ``Union<  ,  ,  >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarVisible:

sidebarVisible
~~~~~~~~~~~~~~

.. js:function:: sidebarVisible(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sidebarWidth:

sidebarWidth
~~~~~~~~~~~~

.. js:function:: sidebarWidth(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < number >`` ``<`` ``number`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.skeleton:

skeleton
~~~~~~~~

.. js:function:: skeleton(param)


   :param param:
   :type param: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < KeypointSkeleton >`` ``<`` :js:class:`fiftyone.state.KeypointSkeleton` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.sortFilterResults:

sortFilterResults
~~~~~~~~~~~~~~~~~

.. js:function:: sortFilterResults(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < SortResults >`` ``<`` :js:class:`fiftyone.state.SortResults` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.string:

string
~~~~~~

.. js:function:: string(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``( value : string )`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stringCountResults:

stringCountResults
~~~~~~~~~~~~~~~~~~

.. js:function:: stringCountResults(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Object`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stringExcludeAtom:

stringExcludeAtom
~~~~~~~~~~~~~~~~~

.. js:function:: stringExcludeAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stringSelectedValuesAtom:

stringSelectedValuesAtom
~~~~~~~~~~~~~~~~~~~~~~~~

.. js:function:: stringSelectedValuesAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stringifyObj:

stringifyObj
~~~~~~~~~~~~

.. js:function:: stringifyObj(obj)


   :param obj:
   :type obj: any
   :rtype: ``any``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.tagging:

tagging
~~~~~~~

.. js:function:: tagging(param)


   :param param:
   :param param.labels:
   :param param.modal:
   :type param: Object
   :type param.labels: boolean
   :type param.modal: boolean
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.textFilter:

textFilter
~~~~~~~~~~

.. js:function:: textFilter(param)


   :param param:
   :type param: boolean
   :rtype: ``RecoilState < string >`` ``<`` ``string`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.transformDataset:

transformDataset
~~~~~~~~~~~~~~~~

.. js:function:: transformDataset(dataset)


   :param dataset:
   :type dataset: any
   :rtype: ``Readonly < Dataset >`` ``<`` :js:class:`fiftyone.state.Dataset` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.trueAtom:

trueAtom
~~~~~~~~

.. js:function:: trueAtom(param)


   :param param:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``RecoilState < boolean >`` ``<`` ``boolean`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.validateGroupName:

validateGroupName
~~~~~~~~~~~~~~~~~

.. js:function:: validateGroupName(current, name)


   :param current:
   :param name:
   :type current: Array< string >
   :type name: string
   :rtype: ``boolean``

.. _fos.@fiftyone/fiftyone.@fiftyone/state.values:

values
~~~~~~

.. js:function:: values(param)


   :param param:
   :param param.extended:
   :param param.modal:
   :param param.path:
   :type param: Object
   :type param.extended: boolean
   :type param.modal: boolean
   :type param.path: string
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly <  >`` ``<`` ``Array< string >`` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.viewStateForm:

viewStateForm
~~~~~~~~~~~~~

.. js:function:: viewStateForm(param)


   :param param:
   :param param.addStages:
   :param param.modal:
   :param param.selectSlice:
   :type param: Object
   :type param.addStages: string
   :type param.modal: boolean
   :type param.selectSlice: boolean
   :rtype: ``readonly`` ``readonly RecoilValueReadOnly < StateForm >`` ``<`` :js:class:`fiftyone.state.StateForm` ``>``

Returns a function which returns a memoized atom for each unique parameter value.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.viewsAreEqual:

viewsAreEqual
~~~~~~~~~~~~~

.. js:function:: viewsAreEqual(viewOne, viewTwo)


   :param viewOne:
   :param viewTwo:
   :type viewOne: any
   :type viewTwo: any
   :rtype: ``boolean``

Types
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SPACE:

SPACE
~~~~~

.. csv-table::
  :header: Name, Value
  :widths: 1 1
  :align: left

  "FRAME"
  "SAMPLE"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.TagKey:

TagKey
~~~~~~

.. csv-table::
  :header: Name, Value
  :widths: 1 1
  :align: left

  "LABEL"
  "SAMPLE"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.AnnotationRun:

AnnotationRun
~~~~~~~~~~~~~

.. js:class:: AnnotationRun


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "config","``Any``"
  "key","``string``"
  "timestamp","``string``"
  "version","``string``"
  "viewStages","``readonly``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.BrainRun:

BrainRun
~~~~~~~~

.. js:class:: BrainRun


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "config","``Object``"
  "key","``string``"
  "timestamp","``string``"
  "version","``string``"
  "viewStages","``readonly``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Config:

Config
~~~~~~

.. js:class:: Config


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "colorPool","``Array<`` ``string`` ``>``"
  "colorscale","``string``"
  "gridZoom","``number``"
  "loopVideos","``boolean``"
  "mediaFields","``Array<`` ``string`` ``>``"
  "notebookHeight","``number``"
  "plugins",":js:class:`fiftyone.state.PluginConfig`"
  "showConfidence","``boolean``"
  "showIndex","``boolean``"
  "showLabel","``boolean``"
  "showTooltip","``boolean``"
  "sidebarMode","``Union<`` ``'all'`` ``,`` ``'best'`` ``,`` ``'fast'`` ``>``"
  "theme","``Union<`` ``'dark'`` ``,`` ``'light'`` ``,`` ``'browser'`` ``>``"
  "timezone","``string``"
  "useFrameNumber","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Dataset:

Dataset
~~~~~~~

.. js:class:: Dataset


The dataset object returned by the API.

Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "appConfig",":js:class:`fiftyone.state.DatasetAppConfig`"
  "brainMethods","``Array<`` :js:class:`fiftyone.state.BrainRun` ``>``"
  "createdAt",":js:class:`fiftyone.state.DateTime`"
  "defaultGroupSlice","``string``"
  "defaultMaskTargets",":js:class:`fiftyone.state.Targets`"
  "defaultSkeleton",":js:class:`fiftyone.state.KeypointSkeleton`"
  "evaluations","``Array<`` :js:class:`fiftyone.state.EvaluationRun` ``>``"
  "frameFields","``Array<`` :js:class:`fiftyone.state.StrictField` ``>``"
  "groupField","``string``"
  "groupMediaTypes","``Array<`` ``Object`` ``>``"
  "groupSlice","``string``"
  "id","``string``"
  "info","``Any``"
  "lastLoadedAt",":js:class:`fiftyone.state.DateTime`"
  "maskTargets","``Any``"
  "mediaType",":js:class:`fiftyone.state.MediaType`"
  "name","``string``"
  "sampleFields","``Array<`` :js:class:`fiftyone.state.StrictField` ``>``"
  "savedViews","``Array<`` :js:class:`fiftyone.state.SavedView` ``>``"
  "skeletons","``Array<`` :js:class:`fiftyone.state.StrictKeypointSkeleton` ``>``"
  "version","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.DatasetAppConfig:

DatasetAppConfig
~~~~~~~~~~~~~~~~

.. js:class:: DatasetAppConfig


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "gridMediaField","``string``"
  "mediaFields","``Array<`` ``string`` ``>``"
  "modalMediaField","``string``"
  "plugins",":js:class:`fiftyone.state.PluginConfig`"
  "sidebarGroups","``Array<`` :js:class:`fiftyone.state.SidebarGroup` ``>``"
  "sidebarMode","``Union<`` ``'all'`` ``,`` ``'best'`` ``,`` ``'fast'`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.DateTime:

DateTime
~~~~~~~~

.. js:class:: DateTime


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "$date","``number``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Description:

Description
~~~~~~~~~~~

.. js:class:: Description


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "changingSavedView","``Boolean``"
  "dataset","``string``"
  "savedViewSlug","``string``"
  "savedViews","``Array<`` :js:class:`fiftyone.state.SavedView` ``>``"
  "selected","``Array<`` ``string`` ``>``"
  "selectedLabels","``Array<`` :js:class:`fiftyone.state.SelectedLabel` ``>``"
  "view","``Array<`` :js:class:`fiftyone.state.Stage` ``>``"
  "viewCls","``string``"
  "viewName","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Evaluation:

Evaluation
~~~~~~~~~~

.. js:class:: Evaluation


.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.EvaluationRun:

EvaluationRun
~~~~~~~~~~~~~

.. js:class:: EvaluationRun


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "config","``Object``"
  "key","``string``"
  "timestamp","``string``"
  "version","``string``"
  "viewStages","``readonly``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Filters:

Filters
~~~~~~~

.. js:class:: Filters


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "[key]","``string``"
  "tags","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.ID:

ID
~~

.. js:class:: ID


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "$oid","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.KeypointSkeleton:

KeypointSkeleton
~~~~~~~~~~~~~~~~

.. js:class:: KeypointSkeleton


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "edges","``Array<`` ``Array<`` ``number`` ``>`` ``>``"
  "labels","``Array<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Run:

Run
~~~

.. js:class:: Run


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "config","``Any``"
  "key","``string``"
  "timestamp","``string``"
  "version","``string``"
  "viewStages","``readonly``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SavedView:

SavedView
~~~~~~~~~

.. js:class:: SavedView


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "color","``string``"
  "createdAt",":js:class:`fiftyone.state.DateTime`"
  "datasetId","``string``"
  "description","``string``"
  "id","``string``"
  "lastLoadedAt",":js:class:`fiftyone.state.DateTime`"
  "lastModifiedAt",":js:class:`fiftyone.state.DateTime`"
  "name","``string``"
  "slug","``string``"
  "viewStages","``Array<`` :js:class:`fiftyone.state.Stage` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SelectedLabel:

SelectedLabel
~~~~~~~~~~~~~

.. js:class:: SelectedLabel


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "field","``string``"
  "frameNumber","``number``"
  "labelId","``string``"
  "sampleId","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SelectedLabelData:

SelectedLabelData
~~~~~~~~~~~~~~~~~

.. js:class:: SelectedLabelData


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "field","``string``"
  "frameNumber","``number``"
  "sampleId","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SelectedLabelMap:

SelectedLabelMap
~~~~~~~~~~~~~~~~

.. js:class:: SelectedLabelMap


.. csv-table::
  :header: Name, Type, Description
  :align: left

  "[labelId]","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SidebarGroup:

SidebarGroup
~~~~~~~~~~~~

.. js:class:: SidebarGroup


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "expanded","``boolean``"
  "name","``string``"
  "paths","``Array<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.SortBySimilarityParameters:

SortBySimilarityParameters
~~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:class:: SortBySimilarityParameters


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "brainKey","``string``"
  "distField","``string``"
  "k","``number``"
  "reverse","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Stage:

Stage
~~~~~

.. js:class:: Stage


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "kwargs","``Array<`` ``[`` ``string`` ``,`` ``any`` ``]`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.StrictKeypointSkeleton:

StrictKeypointSkeleton
~~~~~~~~~~~~~~~~~~~~~~

.. js:class:: StrictKeypointSkeleton


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "edges","``Array<`` ``Array<`` ``number`` ``>`` ``>``"
  "labels","``Array<`` ``string`` ``>``"
  "name","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.Targets:

Targets
~~~~~~~

.. js:class:: Targets


.. csv-table::
  :header: Name, Type, Description
  :align: left

  "[key]","``number``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.MediaType:

.. js:class:: MediaType


MediaType
~~~~~~~~~

Union of :js:class:`'image'`, :js:class:`'group'`, :js:class:`'point_cloud'`, :js:class:`'video'`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.State.PluginConfig:

.. js:class:: PluginConfig


PluginConfig
~~~~~~~~~~~~

An object containing the configuration for plugins.
Each key is the name of a plugin, and the value is the
configuration for that plugin.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.AppSample:

AppSample
~~~~~~~~~

.. js:class:: AppSample


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "filepath","``string``"
  "id","``string``"
  "media_type","``Union<`` ``'image'`` ``,`` ``'video'`` ``,`` ``'point-cloud'`` ``>``"
  "metadata","``Object``"
  "support","``[`` ``number`` ``,`` ``number`` ``]``"
  "tags","``Array<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.EmptyEntry:

EmptyEntry
~~~~~~~~~~

.. js:class:: EmptyEntry


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "group","``string``"
  "kind",":js:class:`fiftyone.state.EMPTY`"
  "shown","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.Entry:

Entry
~~~~~

.. js:class:: Entry


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "entries","``Array<`` ``Object`` ``>``"
  "pathname","``string``"
  "state","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.GroupEntry:

GroupEntry
~~~~~~~~~~

.. js:class:: GroupEntry


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "kind",":js:class:`fiftyone.state.GROUP`"
  "name","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.InputEntry:

InputEntry
~~~~~~~~~~

.. js:class:: InputEntry


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "kind",":js:class:`fiftyone.state.INPUT`"
  "type","``Union<`` ``'filter'`` ``,`` ``'add'`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.LookerStore:

LookerStore
~~~~~~~~~~~

.. js:class:: LookerStore


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "indices","``Map < number , string >`` ``<`` ``number`` ``,`` ``string`` ``>``"
  "lookers","``LRUCache < string , T >`` ``<`` ``string`` ``,`` :js:class:`fiftyone.state.T` ``>``"
  "reset","``(`` ``)``"
  "samples","``Map < string , SampleData >`` ``<`` ``string`` ``,`` :js:class:`fiftyone.state.SampleData` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.MatchPathResult:

MatchPathResult
~~~~~~~~~~~~~~~

.. js:class:: MatchPathResult


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isExact","``boolean``"
  "path","``string``"
  "url","``string``"
  "variables","``VariablesOf <  >`` ``<`` ```` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.ModalNavigation:

ModalNavigation
~~~~~~~~~~~~~~~

.. js:class:: ModalNavigation


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "getIndex","``(`` ``index`` ``:`` ``number`` ``)``"
  "index","``number``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.NumericFilter:

NumericFilter
~~~~~~~~~~~~~

.. js:class:: NumericFilter


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "exclude","``boolean``"
  "inf","``boolean``"
  "nan","``boolean``"
  "ninf","``boolean``"
  "none","``boolean``"
  "range",":js:class:`fiftyone.state.Range`"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.PathEntry:

PathEntry
~~~~~~~~~

.. js:class:: PathEntry


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "kind",":js:class:`fiftyone.state.PATH`"
  "path","``string``"
  "shown","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RouteBase:

RouteBase
~~~~~~~~~

.. js:class:: RouteBase


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "children","``Array<`` :js:class:`fiftyone.state.RouteBase` ``<`` :js:class:`fiftyone.state.T` ``>`` ``>``"
  "component",":js:class:`fiftyone.state.Resource` ``<`` :js:class:`fiftyone.state.Route` ``>``"
  "exact","``boolean``"
  "path","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RouteData:

RouteData
~~~~~~~~~

.. js:class:: RouteData


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "isExact","``boolean``"
  "path","``string``"
  "url","``string``"
  "variables"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RouteDefinition:

RouteDefinition
~~~~~~~~~~~~~~~

.. js:class:: RouteDefinition


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "children","``Array<`` :js:class:`fiftyone.state.RouteDefinition` ``<`` :js:class:`fiftyone.state.T` ``>`` ``>``"
  "component",":js:class:`fiftyone.state.Resource` ``<`` :js:class:`fiftyone.state.Route` ``>``"
  "exact","``boolean``"
  "path","``string``"
  "query",":js:class:`fiftyone.state.Resource` ``<`` ``ConcreteRequest`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RouteOptions:

RouteOptions
~~~~~~~~~~~~

.. js:class:: RouteOptions


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "children","``Array<`` :js:class:`fiftyone.state.RouteOptions` ``<`` :js:class:`fiftyone.state.T` ``>`` ``>``"
  "component","``Object``"
  "exact","``boolean``"
  "path","``string``"
  "query"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.Router:

Router
~~~~~~

.. js:class:: Router


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "cleanup","``(`` ``)``"
  "context",":js:class:`fiftyone.state.RoutingContext` ``<`` :js:class:`fiftyone.state.T` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RoutingContext:

RoutingContext
~~~~~~~~~~~~~~

.. js:class:: RoutingContext


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "get","``(`` ``)``"
  "history","``BrowserHistory``"
  "pathname","``string``"
  "state","``any``"
  "subscribe","``(`` ``cb`` ``:`` ``( entry : Entry )`` ``)``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.SampleData:

SampleData
~~~~~~~~~~

.. js:class:: SampleData


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "aspectRatio","``number``"
  "frameNumber","``number``"
  "frameRate","``number``"
  "sample",":js:class:`fiftyone.state.AppSample`"
  "urls","``Any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.SelectEvent:

SelectEvent
~~~~~~~~~~~

.. js:class:: SelectEvent


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "detail","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.SortResults:

SortResults
~~~~~~~~~~~

.. js:class:: SortResults


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "asc","``boolean``"
  "count","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.StringFilter:

StringFilter
~~~~~~~~~~~~

.. js:class:: StringFilter


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "exclude","``boolean``"
  "values","``Array<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.AggregationResponseFrom:

.. js:class:: AggregationResponseFrom


AggregationResponseFrom
~~~~~~~~~~~~~~~~~~~~~~~

A generic type that extracts the response type from a GraphQL query.

.. _fos.@fiftyone/fiftyone.@fiftyone/state.Lookers:

.. js:class:: Lookers


Lookers
~~~~~~~

Union of :js:class:`FrameLooker`, :js:class:`ImageLooker`, :js:class:`VideoLooker`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.Range:

.. js:class:: Range


Range
~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Range","``[`` ``Union< number ,  , undefined >`` ``,`` ``Union< number ,  , undefined >`` ``]``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.ResponseFrom:

.. js:class:: ResponseFrom


ResponseFrom
~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/state.Route:

.. js:class:: Route


Route
~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Route","``React.FC < React.PropsWithChildren >`` ``<`` ``React.PropsWithChildren <  >`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.SidebarEntry:

.. js:class:: SidebarEntry


SidebarEntry
~~~~~~~~~~~~

Union of :js:class:`EmptyEntry`, :js:class:`GroupEntry`, :js:class:`PathEntry`, :js:class:`InputEntry`

.. _fos.@fiftyone/fiftyone.@fiftyone/state.StateResolver:

.. js:class:: StateResolver


StateResolver
~~~~~~~~~~~~~

Union of :js:class:`StateUpdate`, :js:class:`( t : TransactionInterface_UNSTABLE )`

Enums
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/state.EntryKind:

EntryKind
~~~~~~~~~

.. csv-table::
  :header: Name, Value
  :widths: 1 1
  :align: left

  "EMPTY"
  "GROUP"
  "INPUT"
  "PATH"

Variables
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/state.BeforeScreenshotContext:

BeforeScreenshotContext
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Context < Set >","``Context < Set >`` ``<`` ``Set <  >`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.DEFAULT_ALPHA:

DEFAULT_ALPHA
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``0.7``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.EventsContext:

EventsContext
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Context < EventsSink >","``Context < EventsSink >`` ``<`` :js:class:`fiftyone.state.EventsSink` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.IMAGE_FILTERS:

IMAGE_FILTERS
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "brightness","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.MATCH_LABEL_TAGS:

MATCH_LABEL_TAGS
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "embeddedDocType","``Array<`` ``string`` ``>``"
  "ftype","``string``"
  "path","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RESERVED_GROUPS:

RESERVED_GROUPS
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set < string >","``Set < string >`` ``<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RelayEnvironmentKey:

RelayEnvironmentKey
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "EnvironmentKey","``EnvironmentKey``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.RouterContext:

RouterContext
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "React.Context < RoutingContext >","``React.Context < RoutingContext >`` ``<`` :js:class:`fiftyone.state.RoutingContext` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.appConfigDefault:

appConfigDefault
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.screenshotCallbacks:

screenshotCallbacks
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set <  >","``Set <  >`` ``<`` ``( )`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/state.stores:

stores
~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set <  >","``Set <  >`` ``<`` ``Object`` ``>``"
