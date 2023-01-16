fiftyone.utilities
==================

.. js:module:: fiftyone.utilities

Hooks
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.useExternalLink:

useExternalLink
~~~~~~~~~~~~~~~

.. js:function:: useExternalLink(href)


   :param href:
   :type href: any

         .. js:function:: externalLink


            :param e:
            :type e: any
            :rtype: ``void``

Functions
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.applyAlpha:

applyAlpha
~~~~~~~~~~

.. js:function:: applyAlpha(color, alpha)


   :param color:
   :param alpha:
   :type color: string
   :type alpha: number
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.clone:

clone
~~~~~

.. js:function:: clone(data)


   :param data:
   :type data: T
   :rtype: :js:class:`fiftyone.utilities.Mutable` ``<`` :js:class:`fiftyone.utilities.T` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.createColorGenerator:

createColorGenerator
~~~~~~~~~~~~~~~~~~~~

.. js:function:: createColorGenerator(colorPool, seed)


   :param colorPool:
   :param seed:
   :type colorPool: readonly
   :type seed: number

         .. js:function:: createColorGenerator(colorPool, seed)


            :param value:
            :type value: Union< string , number , boolean >
            :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.createResourceGroup:

createResourceGroup
~~~~~~~~~~~~~~~~~~~

.. js:function:: createResourceGroup()


         .. js:function:: createResourceGroup()


            :param id:
            :param loader:
            :type id: string
            :type loader: ( )
            :rtype: :js:class:`fiftyone.utilities.Resource` ``<`` :js:class:`fiftyone.utilities.T` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.formatDate:

formatDate
~~~~~~~~~~

.. js:function:: formatDate(timeStamp)


   :param timeStamp:
   :type timeStamp: number
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.formatDateTime:

formatDateTime
~~~~~~~~~~~~~~

.. js:function:: formatDateTime(timeStamp, timeZone)


   :param timeStamp:
   :param timeZone:
   :type timeStamp: number
   :type timeZone: string
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.get32BitColor:

get32BitColor
~~~~~~~~~~~~~

.. js:function:: get32BitColor(color, alpha)


   :param color:
   :param alpha:
   :type color: Union< string , RGB >
   :type alpha: number
   :rtype: ``number``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getAPI:

getAPI
~~~~~~

.. js:function:: getAPI()

   :rtype: ``any``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getColor:

getColor
~~~~~~~~

.. js:function:: getColor(pool, seed, fieldOrValue)


   :param pool:
   :param seed:
   :param fieldOrValue:
   :type pool: readonly
   :type seed: number
   :type fieldOrValue: Union< string , number , boolean >
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getColorscaleArray:

getColorscaleArray
~~~~~~~~~~~~~~~~~~

.. js:function:: getColorscaleArray(colorscale, alpha)


   :param colorscale:
   :param alpha:
   :type colorscale: Array< RGB >
   :type alpha: number
   :rtype: ``Readonly < Uint32Array >`` ``<`` ``Uint32Array`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getEventSource:

getEventSource
~~~~~~~~~~~~~~

.. js:function:: getEventSource(path, events, signal, body)


   :param path:
   :param events:
   :param events.onclose:
   :param events.onerror:
   :param events.onmessage:
   :param events.onopen:
   :param signal:
   :param body:
   :type path: string
   :type events: Object
   :type events.onclose: ( )
   :type events.onerror: ( error : Error )
   :type events.onmessage: ( event : EventSourceMessage )
   :type events.onopen: ( )
   :type signal: AbortSignal
   :type body: Any
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getFetchFunction:

getFetchFunction
~~~~~~~~~~~~~~~~

.. js:function:: getFetchFunction()

   :rtype: :js:class:`fiftyone.utilities.FetchFunction`

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getFetchHeaders:

getFetchHeaders
~~~~~~~~~~~~~~~

.. js:function:: getFetchHeaders()

   :rtype: ``HeadersInit``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getFetchOrigin:

getFetchOrigin
~~~~~~~~~~~~~~

.. js:function:: getFetchOrigin()

   :rtype: ``any``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getFetchParameters:

getFetchParameters
~~~~~~~~~~~~~~~~~~

.. js:function:: getFetchParameters()

   :rtype: ``Object``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getFetchPathPrefix:

getFetchPathPrefix
~~~~~~~~~~~~~~~~~~

.. js:function:: getFetchPathPrefix()

   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getMimeType:

getMimeType
~~~~~~~~~~~

.. js:function:: getMimeType(sample)


   :param sample:
   :type sample: any
   :rtype: ``any``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getRGB:

getRGB
~~~~~~

.. js:function:: getRGB(color)


   :param color:
   :type color: string
   :rtype: :js:class:`fiftyone.utilities.RGB`

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getRGBA:

getRGBA
~~~~~~~

.. js:function:: getRGBA(value)


   :param value:
   :type value: number
   :rtype: :js:class:`fiftyone.utilities.RGBA`

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.getRGBAColor:

getRGBAColor
~~~~~~~~~~~~

.. js:function:: getRGBAColor(__namedParameters)


   :param __namedParameters:
   :type __namedParameters: RGBA
   :rtype: ``string``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.isElectron:

isElectron
~~~~~~~~~~

.. js:function:: isElectron()

   :rtype: ``boolean``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.isNotebook:

isNotebook
~~~~~~~~~~

.. js:function:: isNotebook()

   :rtype: ``boolean``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.meetsFieldType:

meetsFieldType
~~~~~~~~~~~~~~

.. js:function:: meetsFieldType(field, __namedParameters)


   :param field:
   :param __namedParameters:
   :param __namedParameters.acceptLists:
   :param __namedParameters.embeddedDocType:
   :param __namedParameters.ftype:
   :type field: Field
   :type __namedParameters: Object
   :type __namedParameters.acceptLists: boolean
   :type __namedParameters.embeddedDocType: Union< string ,  >
   :type __namedParameters.ftype: Union< string ,  >
   :rtype: ``boolean``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.move:

move
~~~~

.. js:function:: move(array, moveIndex, toIndex)


   :param array:
   :param moveIndex:
   :param toIndex:
   :type array: Array< T >
   :type moveIndex: number
   :type toIndex: number
   :rtype: ``Array<`` :js:class:`fiftyone.utilities.T` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.prettify:

prettify
~~~~~~~~

.. js:function:: prettify(v)


   :param v:
   :type v: Union< string , number , boolean ,  >
   :rtype: ``Union<`` ``string`` ``,`` ``URL`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.removeKeys:

removeKeys
~~~~~~~~~~

.. js:function:: removeKeys(obj, keys, startsWith)


   :param obj:
   :param keys:
   :param startsWith:
   :type obj: KeyValue < T >
   :type keys: Iterable < string >
   :type startsWith: boolean
   :rtype: :js:class:`fiftyone.utilities.KeyValue` ``<`` :js:class:`fiftyone.utilities.T` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.rgbToHexCached:

rgbToHexCached
~~~~~~~~~~~~~~

.. js:function:: rgbToHexCached(color)


   :param color:
   :type color: RGB
   :rtype: ``any``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.sendEvent:

sendEvent
~~~~~~~~~

.. js:function:: sendEvent(data)


   :param data:
   :type data: Any
   :rtype: ``Promise < unknown >`` ``<`` ``unknown`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.setFetchFunction:

setFetchFunction
~~~~~~~~~~~~~~~~

.. js:function:: setFetchFunction(origin, headers, pathPrefix)


   :param origin:
   :param headers:
   :param pathPrefix:
   :type origin: string
   :type headers: HeadersInit
   :type pathPrefix: string
   :rtype: ``void``

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.toCamelCase:

toCamelCase
~~~~~~~~~~~

.. js:function:: toCamelCase(obj)


   :param obj:
   :type obj: O
   :rtype: :js:class:`fiftyone.utilities.O`

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.toSnakeCase:

toSnakeCase
~~~~~~~~~~~

.. js:function:: toSnakeCase(obj)


   :param obj:
   :type obj: O
   :rtype: :js:class:`fiftyone.utilities.O`

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.withPath:

withPath
~~~~~~~~

.. js:function:: withPath(path, types)


   :param path:
   :param types:
   :type path: string
   :type types: string
   :rtype: ``string``

.. js:function:: withPath(path, types)


   :param path:
   :param types:
   :type path: string
   :type types: Array< string >
   :rtype: ``Array<`` ``string`` ``>``

Types
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.FetchFunction:

FetchFunction
~~~~~~~~~~~~~

.. js:class:: FetchFunction


.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.Field:

Field
~~~~~

.. js:class:: Field


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "dbField","``string``"
  "description","``string``"
  "embeddedDocType","``string``"
  "fields",":js:class:`fiftyone.utilities.Schema`"
  "ftype","``string``"
  "info","``object``"
  "name","``string``"
  "path","``string``"
  "subfield","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.GQLError:

GQLError
~~~~~~~~

.. js:class:: GQLError


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "extensions","``Object``"
  "message","``string``"
  "paths","``Array<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.Schema:

Schema
~~~~~~

.. js:class:: Schema


.. csv-table::
  :header: Name, Type, Description
  :align: left

  "[key]","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.Stage:

Stage
~~~~~

.. js:class:: Stage


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "kwargs","``Array<`` ``[`` ``string`` ``,`` ``object`` ``]`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.StrictField:

StrictField
~~~~~~~~~~~

.. js:class:: StrictField


Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "dbField","``string``"
  "description","``string``"
  "embeddedDocType","``string``"
  "fields","``Array<`` :js:class:`fiftyone.utilities.StrictField` ``>``"
  "ftype","``string``"
  "info","``object``"
  "name","``string``"
  "path","``string``"
  "subfield","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.RGB:

.. js:class:: RGB


RGB
~~~

Copyright 2017-2022, Voxel51, Inc.

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "RGB","``[`` ``number`` ``,`` ``number`` ``,`` ``number`` ``]``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.RGBA:

.. js:class:: RGBA


RGBA
~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "RGBA","``[`` ``number`` ``,`` ``number`` ``,`` ``number`` ``,`` ``number`` ``]``"

Variables
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.AGGS:

AGGS
~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "BOUNDS","``string``"
  "COUNT","``string``"
  "COUNT_VALUES","``string``"
  "DISTINCT","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.BIG_ENDIAN:

BIG_ENDIAN
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``boolean``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.BOOLEAN_FIELD:

BOOLEAN_FIELD
~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.BooleanField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.CLASSIFICATION:

CLASSIFICATION
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Classification'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.CLASSIFICATIONS:

CLASSIFICATIONS
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Classifications'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.CLIPS_FRAME_FIELDS:

CLIPS_FRAME_FIELDS
~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.CLIPS_SAMPLE_FIELDS:

CLIPS_SAMPLE_FIELDS
~~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DATE_FIELD:

DATE_FIELD
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.DateField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DATE_TIME_FIELD:

DATE_TIME_FIELD
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.DateTimeField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DENSE_LABELS:

DENSE_LABELS
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set < string >","``Set < string >`` ``<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DETECTION:

DETECTION
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Detection'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DETECTIONS:

DETECTIONS
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Detections'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.DICT_FIELD:

DICT_FIELD
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.DictField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.EMBEDDED_DOCUMENT_FIELD:

EMBEDDED_DOCUMENT_FIELD
~~~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.EmbeddedDocumentField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.FLOAT_FIELD:

FLOAT_FIELD
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.FloatField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.FRAME_NUMBER_FIELD:

FRAME_NUMBER_FIELD
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.FrameNumberField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.FRAME_SUPPORT_FIELD:

FRAME_SUPPORT_FIELD
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.FrameSupportField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.GEOLOCATION:

GEOLOCATION
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'GeoLocation'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.GEOLOCATIONS:

GEOLOCATIONS
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'GeoLocations'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.HEATMAP:

HEATMAP
~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Heatmap'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.INT_FIELD:

INT_FIELD
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.IntField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.KEYPOINT:

KEYPOINT
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Keypoint'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.KEYPOINTS:

KEYPOINTS
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Keypoints'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABELS:

LABELS
~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABELS_MAP:

LABELS_MAP
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Classification","``string``"
  "Classifications","``string``"
  "Detection","``string``"
  "Detections","``string``"
  "GeoLocation","``string``"
  "GeoLocations","``string``"
  "Heatmap","``string``"
  "Keypoint","``string``"
  "Keypoints","``string``"
  "Polyline","``string``"
  "Polylines","``string``"
  "Regression","``string``"
  "Segmentation","``string``"
  "TemporalDetection","``string``"
  "TemporalDetections","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABELS_PATH:

LABELS_PATH
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.labels'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABEL_DOC_TYPES:

LABEL_DOC_TYPES
~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABEL_LIST:

LABEL_LIST
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Classifications","``string``"
  "Detections","``string``"
  "Keypoints","``string``"
  "Polylines","``string``"
  "TemporalDetections","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABEL_LISTS:

LABEL_LISTS
~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LABEL_LISTS_MAP:

LABEL_LISTS_MAP
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Classifications","``string``"
  "Detections","``string``"
  "Keypoints","``string``"
  "Polylines","``string``"
  "TemporalDetections","``string``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.LIST_FIELD:

LIST_FIELD
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.ListField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.MASK_LABELS:

MASK_LABELS
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set < string >","``Set < string >`` ``<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.NONFINITES:

NONFINITES
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "Set < string >","``Set < string >`` ``<`` ``string`` ``>``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.OBJECT_ID_FIELD:

OBJECT_ID_FIELD
~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.ObjectIdField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.PATCHES_FIELDS:

PATCHES_FIELDS
~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.POLYLINE:

POLYLINE
~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Polyline'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.POLYLINES:

POLYLINES
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Polylines'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.REGRESSION:

REGRESSION
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Regression'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.SEGMENTATION:

SEGMENTATION
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'Segmentation'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.STRING_FIELD:

STRING_FIELD
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'fiftyone.core.fields.StringField'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.TEMPORAL_DETECTION:

TEMPORAL_DETECTION
~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'TemporalDetection'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.TEMPORAL_DETECTIONS:

TEMPORAL_DETECTIONS
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "``'TemporalDetections'``"

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_CLASS_TYPES:

VALID_CLASS_TYPES
~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_DISTRIBUTION_TYPES:

VALID_DISTRIBUTION_TYPES
~~~~~~~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_KEYPOINTS:

VALID_KEYPOINTS
~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_LABEL_TYPES:

VALID_LABEL_TYPES
~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_LIST_FIELDS:

VALID_LIST_FIELDS
~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_LIST_TYPES:

VALID_LIST_TYPES
~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_MASK_TYPES:

VALID_MASK_TYPES
~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_NUMERIC_TYPES:

VALID_NUMERIC_TYPES
~~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_OBJECT_TYPES:

VALID_OBJECT_TYPES
~~~~~~~~~~~~~~~~~~

.. _fos.@fiftyone/fiftyone.@fiftyone/utilities.VALID_PRIMITIVE_TYPES:

VALID_PRIMITIVE_TYPES
~~~~~~~~~~~~~~~~~~~~~
