fiftyone.relay
==============

.. js:module:: fiftyone.relay

Types
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.AggregationForm:

.. js:class:: AggregationForm


AggregationForm
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "AggregationForm.dataset","``string``"
  "AggregationForm.extendedStages","``Array<`` ``any`` ``>``"
  "AggregationForm.filters","``Union<`` ``object`` ``,`` ``null`` ``>``"
  "AggregationForm.groupId","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "AggregationForm.hiddenLabels","``ReadonlyArray < SelectedLabel >`` ``<`` :js:class:`fiftyone.relay.SelectedLabel` ``>``"
  "AggregationForm.index","``Union<`` ``number`` ``,`` ``null`` ``>``"
  "AggregationForm.mixed","``boolean``"
  "AggregationForm.paths","``ReadonlyArray < string >`` ``<`` ``string`` ``>``"
  "AggregationForm.sampleIds","``ReadonlyArray < string >`` ``<`` ``string`` ``>``"
  "AggregationForm.slice","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "AggregationForm.view","``Array<`` ``any`` ``>``"
  "AggregationForm.viewName","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.ColorBy:

.. js:class:: ColorBy


ColorBy
~~~~~~~

Union of :js:class:`'field'`, :js:class:`'instance'`, :js:class:`'label'`, :js:class:`'%future added value'`

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.ExtendedViewForm:

.. js:class:: ExtendedViewForm


ExtendedViewForm
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "ExtendedViewForm.filters","``Union<`` ``object`` ``,`` ``null`` ``>``"
  "ExtendedViewForm.mixed","``Union<`` ``boolean`` ``,`` ``null`` ``>``"
  "ExtendedViewForm.sampleIds","``Union<`` ``ReadonlyArray < string >`` ``,`` ``null`` ``>``"
  "ExtendedViewForm.slice","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.GroupElementFilter:

.. js:class:: GroupElementFilter


GroupElementFilter
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GroupElementFilter.id","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "GroupElementFilter.slice","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.MediaType:

.. js:class:: MediaType


MediaType
~~~~~~~~~

Union of :js:class:`'group'`, :js:class:`'image'`, :js:class:`'point_cloud'`, :js:class:`'video'`, :js:class:`'%future added value'`

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.SampleFilter:

.. js:class:: SampleFilter


SampleFilter
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "SampleFilter.group","``Union<`` :js:class:`fiftyone.relay.GroupElementFilter` ``,`` ``null`` ``>``"
  "SampleFilter.id","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.SavedViewInfo:

.. js:class:: SavedViewInfo


SavedViewInfo
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "SavedViewInfo.color","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "SavedViewInfo.description","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "SavedViewInfo.name","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.SelectedLabel:

.. js:class:: SelectedLabel


SelectedLabel
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "SelectedLabel.field","``string``"
  "SelectedLabel.frameNumber","``Union<`` ``number`` ``,`` ``null`` ``>``"
  "SelectedLabel.labelId","``string``"
  "SelectedLabel.sampleId","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.SidebarGroupInput:

.. js:class:: SidebarGroupInput


SidebarGroupInput
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "SidebarGroupInput.expanded","``Union<`` ``boolean`` ``,`` ``null`` ``>``"
  "SidebarGroupInput.name","``string``"
  "SidebarGroupInput.paths","``Union<`` ``ReadonlyArray < string >`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.SidebarMode:

.. js:class:: SidebarMode


SidebarMode
~~~~~~~~~~~

Union of :js:class:`'all'`, :js:class:`'best'`, :js:class:`'fast'`, :js:class:`'%future added value'`

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.StateForm:

.. js:class:: StateForm


StateForm
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "StateForm.addStages","``Union<`` ``Array< any >`` ``,`` ``null`` ``>``"
  "StateForm.extended","``Union<`` ``object`` ``,`` ``null`` ``>``"
  "StateForm.filters","``Union<`` ``object`` ``,`` ``null`` ``>``"
  "StateForm.labels","``Union<`` ``ReadonlyArray < SelectedLabel >`` ``,`` ``null`` ``>``"
  "StateForm.sampleIds","``Union<`` ``ReadonlyArray < string >`` ``,`` ``null`` ``>``"
  "StateForm.slice","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.Theme:

.. js:class:: Theme


Theme
~~~~~

Union of :js:class:`'browser'`, :js:class:`'dark'`, :js:class:`'light'`, :js:class:`'%future added value'`

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.aggregationsQuery:

.. js:class:: aggregationsQuery


aggregationsQuery
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "aggregationsQuery.response",":js:class:`fiftyone.relay.aggregationsQuery$data`"
  "aggregationsQuery.variables",":js:class:`fiftyone.relay.aggregationsQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.aggregationsQuery$data:

.. js:class:: aggregationsQuery$data


aggregationsQuery$data
~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "aggregationsQuery$data.aggregations","``ReadonlyArray <  >`` ``<`` ``Object`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.aggregationsQuery$variables:

.. js:class:: aggregationsQuery$variables


aggregationsQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "aggregationsQuery$variables.form",":js:class:`fiftyone.relay.AggregationForm`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.configQuery:

.. js:class:: configQuery


configQuery
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "configQuery.response",":js:class:`fiftyone.relay.configQuery$data`"
  "configQuery.variables",":js:class:`fiftyone.relay.configQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.configQuery$data:

.. js:class:: configQuery$data


configQuery$data
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "configQuery$data.colorscale","``Union<`` ``ReadonlyArray < ReadonlyArray >`` ``,`` ``null`` ``>``"
  "configQuery$data.config","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.configQuery$variables:

.. js:class:: configQuery$variables


configQuery$variables
~~~~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.countValuesQuery:

.. js:class:: countValuesQuery


countValuesQuery
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "countValuesQuery.response",":js:class:`fiftyone.relay.countValuesQuery$data`"
  "countValuesQuery.variables",":js:class:`fiftyone.relay.countValuesQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.countValuesQuery$data:

.. js:class:: countValuesQuery$data


countValuesQuery$data
~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "countValuesQuery$data.aggregate","``ReadonlyArray <  >`` ``<`` ``Union<  ,  ,  >`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.countValuesQuery$variables:

.. js:class:: countValuesQuery$variables


countValuesQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "countValuesQuery$variables.dataset","``string``"
  "countValuesQuery$variables.form","``Union<`` :js:class:`fiftyone.relay.ExtendedViewForm` ``,`` ``null`` ``>``"
  "countValuesQuery$variables.path","``string``"
  "countValuesQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.createSavedViewMutation:

.. js:class:: createSavedViewMutation


createSavedViewMutation
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "createSavedViewMutation.response",":js:class:`fiftyone.relay.createSavedViewMutation$data`"
  "createSavedViewMutation.variables",":js:class:`fiftyone.relay.createSavedViewMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.createSavedViewMutation$data:

.. js:class:: createSavedViewMutation$data


createSavedViewMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "createSavedViewMutation$data.createSavedView","``Union<`` ``Object`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.createSavedViewMutation$variables:

.. js:class:: createSavedViewMutation$variables


createSavedViewMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "createSavedViewMutation$variables.color","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "createSavedViewMutation$variables.datasetName","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "createSavedViewMutation$variables.description","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "createSavedViewMutation$variables.form","``Union<`` :js:class:`fiftyone.relay.StateForm` ``,`` ``null`` ``>``"
  "createSavedViewMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "createSavedViewMutation$variables.subscription","``string``"
  "createSavedViewMutation$variables.viewName","``string``"
  "createSavedViewMutation$variables.viewStages","``Union<`` ``Array< any >`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.deleteSavedViewMutation:

.. js:class:: deleteSavedViewMutation


deleteSavedViewMutation
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "deleteSavedViewMutation.response",":js:class:`fiftyone.relay.deleteSavedViewMutation$data`"
  "deleteSavedViewMutation.variables",":js:class:`fiftyone.relay.deleteSavedViewMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.deleteSavedViewMutation$data:

.. js:class:: deleteSavedViewMutation$data


deleteSavedViewMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "deleteSavedViewMutation$data.deleteSavedView","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.deleteSavedViewMutation$variables:

.. js:class:: deleteSavedViewMutation$variables


deleteSavedViewMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "deleteSavedViewMutation$variables.datasetName","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "deleteSavedViewMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "deleteSavedViewMutation$variables.subscription","``string``"
  "deleteSavedViewMutation$variables.viewName","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.histogramValuesQuery:

.. js:class:: histogramValuesQuery


histogramValuesQuery
~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "histogramValuesQuery.response",":js:class:`fiftyone.relay.histogramValuesQuery$data`"
  "histogramValuesQuery.variables",":js:class:`fiftyone.relay.histogramValuesQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.histogramValuesQuery$data:

.. js:class:: histogramValuesQuery$data


histogramValuesQuery$data
~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "histogramValuesQuery$data.aggregate","``ReadonlyArray <  >`` ``<`` ``Union<  ,  ,  ,  >`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.histogramValuesQuery$variables:

.. js:class:: histogramValuesQuery$variables


histogramValuesQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "histogramValuesQuery$variables.dataset","``string``"
  "histogramValuesQuery$variables.form","``Union<`` :js:class:`fiftyone.relay.ExtendedViewForm` ``,`` ``null`` ``>``"
  "histogramValuesQuery$variables.path","``string``"
  "histogramValuesQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.mainSampleQuery:

.. js:class:: mainSampleQuery


mainSampleQuery
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "mainSampleQuery.response",":js:class:`fiftyone.relay.mainSampleQuery$data`"
  "mainSampleQuery.variables",":js:class:`fiftyone.relay.mainSampleQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.mainSampleQuery$data:

.. js:class:: mainSampleQuery$data


mainSampleQuery$data
~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "mainSampleQuery$data.sample","``Union<`` ``Object`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.mainSampleQuery$variables:

.. js:class:: mainSampleQuery$variables


mainSampleQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "mainSampleQuery$variables.dataset","``string``"
  "mainSampleQuery$variables.filter",":js:class:`fiftyone.relay.SampleFilter`"
  "mainSampleQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupPageQuery:

.. js:class:: paginateGroupPageQuery


paginateGroupPageQuery
~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupPageQuery.response",":js:class:`fiftyone.relay.paginateGroupPageQuery$data`"
  "paginateGroupPageQuery.variables",":js:class:`fiftyone.relay.paginateGroupPageQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupPageQuery$data:

.. js:class:: paginateGroupPageQuery$data


paginateGroupPageQuery$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupPageQuery$data. $fragmentSpreads","``FragmentRefs <  >`` ``<`` ``'paginateGroup_query'`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupPageQuery$variables:

.. js:class:: paginateGroupPageQuery$variables


paginateGroupPageQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupPageQuery$variables.count","``Union<`` ``number`` ``,`` ``null`` ``>``"
  "paginateGroupPageQuery$variables.cursor","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "paginateGroupPageQuery$variables.dataset","``string``"
  "paginateGroupPageQuery$variables.filter","``Union<`` :js:class:`fiftyone.relay.SampleFilter` ``,`` ``null`` ``>``"
  "paginateGroupPageQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupQuery:

.. js:class:: paginateGroupQuery


paginateGroupQuery
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupQuery.response",":js:class:`fiftyone.relay.paginateGroupQuery$data`"
  "paginateGroupQuery.variables",":js:class:`fiftyone.relay.paginateGroupQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupQuery$data:

.. js:class:: paginateGroupQuery$data


paginateGroupQuery$data
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupQuery$data. $fragmentSpreads","``FragmentRefs <  >`` ``<`` ``'paginateGroup_query'`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupQuery$variables:

.. js:class:: paginateGroupQuery$variables


paginateGroupQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroupQuery$variables.count","``Union<`` ``number`` ``,`` ``null`` ``>``"
  "paginateGroupQuery$variables.cursor","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "paginateGroupQuery$variables.dataset","``string``"
  "paginateGroupQuery$variables.filter",":js:class:`fiftyone.relay.SampleFilter`"
  "paginateGroupQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroup_query$data:

.. js:class:: paginateGroup_query$data


paginateGroup_query$data
~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroup_query$data. $fragmentType","``'paginateGroup_query'``"
  "paginateGroup_query$data.samples","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroup_query$key:

.. js:class:: paginateGroup_query$key


paginateGroup_query$key
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "paginateGroup_query$key. $data",":js:class:`fiftyone.relay.paginateGroup_query$data`"
  "paginateGroup_query$key. $fragmentSpreads","``FragmentRefs <  >`` ``<`` ``'paginateGroup_query'`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.pinnedSampleQuery:

.. js:class:: pinnedSampleQuery


pinnedSampleQuery
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "pinnedSampleQuery.response",":js:class:`fiftyone.relay.pinnedSampleQuery$data`"
  "pinnedSampleQuery.variables",":js:class:`fiftyone.relay.pinnedSampleQuery$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.pinnedSampleQuery$data:

.. js:class:: pinnedSampleQuery$data


pinnedSampleQuery$data
~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "pinnedSampleQuery$data.sample","``Union<`` ``Object`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.pinnedSampleQuery$variables:

.. js:class:: pinnedSampleQuery$variables


pinnedSampleQuery$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "pinnedSampleQuery$variables.dataset","``string``"
  "pinnedSampleQuery$variables.filter",":js:class:`fiftyone.relay.SampleFilter`"
  "pinnedSampleQuery$variables.view","``Array<`` ``any`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setDatasetMutation:

.. js:class:: setDatasetMutation


setDatasetMutation
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setDatasetMutation.response",":js:class:`fiftyone.relay.setDatasetMutation$data`"
  "setDatasetMutation.variables",":js:class:`fiftyone.relay.setDatasetMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setDatasetMutation$data:

.. js:class:: setDatasetMutation$data


setDatasetMutation$data
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setDatasetMutation$data.setDataset","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setDatasetMutation$variables:

.. js:class:: setDatasetMutation$variables


setDatasetMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setDatasetMutation$variables.name","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setDatasetMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setDatasetMutation$variables.subscription","``string``"
  "setDatasetMutation$variables.viewName","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setGroupSliceMutation:

.. js:class:: setGroupSliceMutation


setGroupSliceMutation
~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setGroupSliceMutation.response",":js:class:`fiftyone.relay.setGroupSliceMutation$data`"
  "setGroupSliceMutation.variables",":js:class:`fiftyone.relay.setGroupSliceMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setGroupSliceMutation$data:

.. js:class:: setGroupSliceMutation$data


setGroupSliceMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setGroupSliceMutation$data.setGroupSlice","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setGroupSliceMutation$variables:

.. js:class:: setGroupSliceMutation$variables


setGroupSliceMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setGroupSliceMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setGroupSliceMutation$variables.slice","``string``"
  "setGroupSliceMutation$variables.subscription","``string``"
  "setGroupSliceMutation$variables.view","``Array<`` ``any`` ``>``"
  "setGroupSliceMutation$variables.viewName","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedLabelsMutation:

.. js:class:: setSelectedLabelsMutation


setSelectedLabelsMutation
~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedLabelsMutation.response",":js:class:`fiftyone.relay.setSelectedLabelsMutation$data`"
  "setSelectedLabelsMutation.variables",":js:class:`fiftyone.relay.setSelectedLabelsMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedLabelsMutation$data:

.. js:class:: setSelectedLabelsMutation$data


setSelectedLabelsMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedLabelsMutation$data.setSelectedLabels","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedLabelsMutation$variables:

.. js:class:: setSelectedLabelsMutation$variables


setSelectedLabelsMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedLabelsMutation$variables.selectedLabels","``ReadonlyArray < SelectedLabel >`` ``<`` :js:class:`fiftyone.relay.SelectedLabel` ``>``"
  "setSelectedLabelsMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setSelectedLabelsMutation$variables.subscription","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedMutation:

.. js:class:: setSelectedMutation


setSelectedMutation
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedMutation.response",":js:class:`fiftyone.relay.setSelectedMutation$data`"
  "setSelectedMutation.variables",":js:class:`fiftyone.relay.setSelectedMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedMutation$data:

.. js:class:: setSelectedMutation$data


setSelectedMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedMutation$data.setSelected","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedMutation$variables:

.. js:class:: setSelectedMutation$variables


setSelectedMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSelectedMutation$variables.selected","``ReadonlyArray < string >`` ``<`` ``string`` ``>``"
  "setSelectedMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setSelectedMutation$variables.subscription","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSidebarGroupsMutation:

.. js:class:: setSidebarGroupsMutation


setSidebarGroupsMutation
~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSidebarGroupsMutation.response",":js:class:`fiftyone.relay.setSidebarGroupsMutation$data`"
  "setSidebarGroupsMutation.variables",":js:class:`fiftyone.relay.setSidebarGroupsMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSidebarGroupsMutation$data:

.. js:class:: setSidebarGroupsMutation$data


setSidebarGroupsMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSidebarGroupsMutation$data.setSidebarGroups","``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSidebarGroupsMutation$variables:

.. js:class:: setSidebarGroupsMutation$variables


setSidebarGroupsMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setSidebarGroupsMutation$variables.dataset","``string``"
  "setSidebarGroupsMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setSidebarGroupsMutation$variables.sidebarGroups","``ReadonlyArray < SidebarGroupInput >`` ``<`` :js:class:`fiftyone.relay.SidebarGroupInput` ``>``"
  "setSidebarGroupsMutation$variables.stages","``Array<`` ``any`` ``>``"
  "setSidebarGroupsMutation$variables.subscription","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setViewMutation:

.. js:class:: setViewMutation


setViewMutation
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setViewMutation.response",":js:class:`fiftyone.relay.setViewMutation$data`"
  "setViewMutation.variables",":js:class:`fiftyone.relay.setViewMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setViewMutation$data:

.. js:class:: setViewMutation$data


setViewMutation$data
~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setViewMutation$data.setView","``Object``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setViewMutation$variables:

.. js:class:: setViewMutation$variables


setViewMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "setViewMutation$variables.changingSavedView","``Union<`` ``boolean`` ``,`` ``null`` ``>``"
  "setViewMutation$variables.datasetName","``string``"
  "setViewMutation$variables.form",":js:class:`fiftyone.relay.StateForm`"
  "setViewMutation$variables.savedViewSlug","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setViewMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "setViewMutation$variables.subscription","``string``"
  "setViewMutation$variables.view","``Array<`` ``any`` ``>``"
  "setViewMutation$variables.viewName","``Union<`` ``string`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.updateSavedViewMutation:

.. js:class:: updateSavedViewMutation


updateSavedViewMutation
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "updateSavedViewMutation.response",":js:class:`fiftyone.relay.updateSavedViewMutation$data`"
  "updateSavedViewMutation.variables",":js:class:`fiftyone.relay.updateSavedViewMutation$variables`"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.updateSavedViewMutation$data:

.. js:class:: updateSavedViewMutation$data


updateSavedViewMutation$data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "updateSavedViewMutation$data.updateSavedView","``Union<`` ``Object`` ``,`` ``null`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.updateSavedViewMutation$variables:

.. js:class:: updateSavedViewMutation$variables


updateSavedViewMutation$variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "updateSavedViewMutation$variables.datasetName","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "updateSavedViewMutation$variables.session","``Union<`` ``string`` ``,`` ``null`` ``>``"
  "updateSavedViewMutation$variables.subscription","``string``"
  "updateSavedViewMutation$variables.updatedInfo",":js:class:`fiftyone.relay.SavedViewInfo`"
  "updateSavedViewMutation$variables.viewName","``string``"

Variables
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.aggregation:

aggregation
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.config:

config
~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.countValues:

countValues
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.createSavedView:

createSavedView
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.deleteSavedView:

deleteSavedView
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.histogramValues:

histogramValues
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.mainSample:

mainSample
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroup:

paginateGroup
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.paginateGroupPaginationFragment:

paginateGroupPaginationFragment
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.pinnedSample:

pinnedSample
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setDataset:

setDataset
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setGroupSlice:

setGroupSlice
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelected:

setSelected
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSelectedLabels:

setSelectedLabels
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setSidebarGroups:

setSidebarGroups
~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.setView:

setView
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"

.. _fos.@fiftyone/fiftyone.@fiftyone/relay.updateSavedView:

updateSavedView
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "GraphQLTaggedNode","``GraphQLTaggedNode``"
