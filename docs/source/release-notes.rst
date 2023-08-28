FiftyOne Release Notes
======================

.. default-role:: code

.. _release-notes-teams-v1.3.6:

FiftyOne Teams 1.3.6
--------------------
*Released August 8, 2023*

Includes all updates from :ref:`FiftyOne 0.21.6 <release-notes-v0.21.6>`.

.. _release-notes-v0.21.6:

FiftyOne 0.21.6
---------------
*Released August 8, 2023*

App

- Fixed the Embeddings panel
  `#3401 <https://github.com/voxel51/fiftyone/pull/3401>`_
- Fixed a bug when using the sidebar to filter views that have selected fields
  `#3405 <https://github.com/voxel51/fiftyone/pull/3405>`_

.. _release-notes-teams-v1.3.5:

FiftyOne Teams 1.3.5
--------------------
*Released August 7, 2023*

Includes all updates from :ref:`FiftyOne 0.21.5 <release-notes-v0.21.5>`, plus:

App

- Fixed a bug with :ref:`dataset search <teams-homepage>` where suggestions may
  not appear when matches across multiple types collide
- Upgraded the :ref:`Plugin configuration UI <teams-plugins>` to better explain
  the available Operator permission configuration options

SDK

- Significant performance optimizations by introducing cursor batching for
  relevant API endpoints

.. _release-notes-v0.21.5:

FiftyOne 0.21.5
---------------
*Released August 7, 2023*

News

- Added `Segment Anything <https://segment-anything.com>`_ to the
  :ref:`Model Zoo <model-zoo>`!
  `#3330 <https://github.com/voxel51/fiftyone/pull/3330>`_
- Added `DINOv2 <https://github.com/facebookresearch/dinov2>`_ to the
  :ref:`Model Zoo <model-zoo>`!
  `#2951 <https://github.com/voxel51/fiftyone/pull/2951>`_
- Added support for loading models from the :ref:`PyTorch Hub <pytorch-hub>`!
  `#2949 <https://github.com/voxel51/fiftyone/pull/2949>`_

App

- Added support for controlling field visibility in the grid independent of
  filtering `#3248 <https://github.com/voxel51/fiftyone/pull/3248>`_
- Added support for filtering by label tags in individual label fields
  `#3287 <https://github.com/voxel51/fiftyone/pull/3287>`_
- Added support for specifying :ref:`custom colors <app-color-schemes-app>` for
  list fields `#3319 <https://github.com/voxel51/fiftyone/pull/3319>`_
- Added support for opening the :ref:`color panel <app-color-schemes-app>` when
  the sample modal is open
  `#3355 <https://github.com/voxel51/fiftyone/pull/3355>`_
- Added helper text explaining custom color options
  `#3383 <https://github.com/voxel51/fiftyone/pull/3383>`_
- Added support for viewing slices of grouped datasets in the
  :ref:`Embeddings panel <app-embeddings-panel>`
  `#3351 <https://github.com/voxel51/fiftyone/pull/3351>`_
- Added support for coloring embeddings plots by list fields
  `#3326 <https://github.com/voxel51/fiftyone/pull/3326>`_
- Improved overflow when the actions row contains many icons
  `#3296 <https://github.com/voxel51/fiftyone/pull/3296>`_
- Added support for tagging all visible PCD slices
  `#3384 <https://github.com/voxel51/fiftyone/pull/3384>`_
- Improved handling of group datasets whose groups may contain missing samples
  for certain slices
  `#3333 <https://github.com/voxel51/fiftyone/pull/3333>`_
- Fixed various issues when visualizing grouped datasets
  `#3353 <https://github.com/voxel51/fiftyone/pull/3353>`_,
  `#3322 <https://github.com/voxel51/fiftyone/pull/3322>`_,
  `#3318 <https://github.com/voxel51/fiftyone/pull/3318>`_,
  `#3379 <https://github.com/voxel51/fiftyone/pull/3379>`_,
  `#3318 <https://github.com/voxel51/fiftyone/pull/3318>`_
- Added bazel support
  `#3338 <https://github.com/voxel51/fiftyone/pull/3338>`_
- Removed the maximum ``starlette`` version requirement
  `#3297 <https://github.com/voxel51/fiftyone/pull/3297>`_

Plugins

- Added support for accessing the currently selected labels in the App within
  plugin execution contexts
  `#3295 <https://github.com/voxel51/fiftyone/pull/3295>`_
- Added support for configuring custom
  :ref:`Operator icons <fiftyone-operators>`
  `#3299 <https://github.com/voxel51/fiftyone/pull/3299>`_
- Improved Operator form validation debounce behavior
  `#3291 <https://github.com/voxel51/fiftyone/pull/3291>`_
- Fixed some bugs that prevented customer visualizer plugins from being
  recognized
  `#3357 <https://github.com/voxel51/fiftyone/pull/3357>`_

Core

- Improved robustness of concurrent schema updates
  `#3308 <https://github.com/voxel51/fiftyone/pull/3308>`_
- Schema changes are now maintained by the
  :meth:`select_group_slices() <fiftyone.core.collections.SampleCollection.select_group_slices>`
  stage
  `#3336 <https://github.com/voxel51/fiftyone/pull/3336>`_
- Added support for exporting keypoints with nan-valued coordinates in
  :ref:`COCO format <COCODetectionDataset-export>`
  `#3316 <https://github.com/voxel51/fiftyone/pull/3316>`_
- Updated :ref:`YOLOv5 exports <YOLOv5Dataset-export>` to use dict-style class
  names
  `#3393 <https://github.com/voxel51/fiftyone/pull/3393>`_
- Fixed a bug when passing an RGB hex string to
  :meth:`to_segmentation() <fiftyone.core.labels.Detection.to_segmentation>`
  `#3293 <https://github.com/voxel51/fiftyone/pull/3293>`_
- Fixed a bug where
  :meth:`has_field() <fiftyone.core.document.Document.has_field>` would not
  recognize dynamic fields
  `#3349 <https://github.com/voxel51/fiftyone/pull/3349>`_
- Fixed a bug when applying
  :meth:`merge_sample() <fiftyone.core.dataset.Dataset.merge_sample>` to
  grouped datasets
  `#3327 <https://github.com/voxel51/fiftyone/pull/3327>`_

Zoo

- Use ``weights`` parameter instead of deprecated ``pretrained`` parameter for
  torchvision models
  `#3348 <https://github.com/voxel51/fiftyone/pull/3348>`_
- Added support for running zoo models with the MPS backend
  `#2843 <https://github.com/voxel51/fiftyone/pull/2843>`_
- Fixed YouTube video downloading for zoo datasets like
  :ref:`ActivityNet <dataset-zoo-activitynet-200>` and
  :ref:`Kinetics <dataset-zoo-kinetics-700-2020>`
  `#3382 <https://github.com/voxel51/fiftyone/pull/3382>`_

Annotation

- Upgraded the :ref:`Labelbox integration <labelbox-integration>` to support
  the latest Labelbox API version
  `#3323 <https://github.com/voxel51/fiftyone/pull/3323>`_
- Fixed text and checkbox attribute usage when using CVAT 2.5
  `#3373 <https://github.com/voxel51/fiftyone/pull/3373>`_

Brain

- Added support for :ref:`gRPC connections <qdrant-setup>` when using the
  Qdrant similarity backend
  `#3296 <https://github.com/voxel51/fiftyone/pull/3296>`_
- Improved support for
  :ref:`creating similarity indexes <brain-similarity-api>` with embeddings
  stored in dataset fields
- Resolved bugs with similarity queries using the sklearn backend
  `#3304 <https://github.com/voxel51/fiftyone/issues/3304>`_,
  `#3305 <https://github.com/voxel51/fiftyone/issues/3305>`_

Docs

- Fixed some documentation typos
  `#3283 <https://github.com/voxel51/fiftyone/issues/3283>`_,
  `#3289 <https://github.com/voxel51/fiftyone/issues/3289>`_,
  `#3290 <https://github.com/voxel51/fiftyone/issues/3290>`_

.. _release-notes-v0.21.4:

FiftyOne 0.21.4
---------------
*Released July 14, 2023*

- Fixed :class:`Session <fiftyone.core.session.Session>` event emission
  `#3301 <https://github.com/voxel51/fiftyone/pull/3301>`_

.. _release-notes-teams-v1.3.3:

FiftyOne Teams 1.3.3
--------------------
*Released July 12, 2023*

Includes all updates from :ref:`FiftyOne 0.21.3 <release-notes-v0.21.3>`, plus:

SDK

- Added a `cache=True` option to the
  :ref:`upload_media() <teams-cloud-api-reference>` utility that allows for
  automatically adding any uploaded files to your local cache
- Fixed a bug when launching the App locally via API connections

.. _release-notes-v0.21.3:

FiftyOne 0.21.3
---------------
*Released July 12, 2023*

News

- Released a :ref:`Milvus integration <milvus-integration>` for native text and
  image searches on FiftyOne datasets!
- Released a :ref:`LanceDB integration <lancedb-integration>` for native text
  and image searches on FiftyOne datasets!

App

- Added support for embedded keypoint fields in
  :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`
  `#3279 <https://github.com/voxel51/fiftyone/pull/3279>`_
- Fixed keypoint filtering
  `#3270 <https://github.com/voxel51/fiftyone/pull/3280>`_
- Fixed a bug that caused non-matching samples to remain in the grid when
  applying multiple sidebar filters
  `#3270 <https://github.com/voxel51/fiftyone/pull/3270>`_
- Fixed a bug when filtering by IDs in the sidebar
  `#3270 <https://github.com/voxel51/fiftyone/pull/3270>`_
- Fixed label tags grid bubbles for filterless views
  `#3257 <https://github.com/voxel51/fiftyone/pull/3267>`_

Core

- Added a :meth:`merge_sample() <fiftyone.core.dataset.Dataset.merge_sample>`
  method for merging individual samples into existing datasets
  `#3274 <https://github.com/voxel51/fiftyone/pull/3274>`_
- Fixed a bug when passing dict-valued `points` to
  :func:`compute_visualization() <fiftyone.brain.compute_visualization>`
  `#3268 <https://github.com/voxel51/fiftyone/pull/3268>`_
- Fixed a bug when filtering keypoints stored in embedded documents
  `#3279 <https://github.com/voxel51/fiftyone/pull/3279>`_

.. _release-notes-teams-v1.3.2:

FiftyOne Teams 1.3.2
--------------------
*Released July 5, 2023*

Includes all updates from :ref:`FiftyOne 0.21.2 <release-notes-v0.21.2>`.

.. _release-notes-v0.21.2:

FiftyOne 0.21.2
---------------
*Released July 3, 2023*

App

- Fixes grid pagination results after applying sidebar filters
  `#3249 <https://github.com/voxel51/fiftyone/pull/3249>`_
- Fixes redundant sidebar groups for custom schemas
  `#3250 <https://github.com/voxel51/fiftyone/pull/3250>`_

.. _release-notes-teams-v1.3.1:

FiftyOne Teams 1.3.1
--------------------
*Released June 30, 2023*

Includes all features from :ref:`FiftyOne 0.21.1 <release-notes-v0.21.1>`,
plus:

General

- App containers no longer need to be restarted in order for Azure/MinIO
  credentials uploaded via the Teams UI to be properly recognized
- Fixed an intermittent bug when computing metadata for remote filepaths
- Reverted a change from Teams 1.3.0 so that the SDK again supports the
  declared minimum version requirement of `pymongo==3.12`

SDK

- Updated the order of precedence for SDK connections so that
  :ref:`API connections <teams-api-connection>` take precedence over
  :ref:`direct database connections <configuring-mongodb-connection>`
- Fixed a bug when connecting to Teams deployments with non-standard database
  names via API connections
- Fixed a bug when saving run results using API connections
- Fixed a bug when deleting datasets using API connections

Management SDK

- Added support for
  :ref:`deleting user invitations <teams-sdk-user-management>` by email in
  addition to invitation ID
- Added support for
  :ref:`configuring permissions <teams-sdk-dataset-permissions>` for invited
  users that have not yet logged in

.. _release-notes-v0.21.1:

FiftyOne 0.21.1
---------------
*Released June 30, 2023*

App

- Sidebar filters can now :ref:`leverage indexes <app-indexed-filtering>` for
  improved performance!
  `#3137 <https://github.com/voxel51/fiftyone/pull/3137>`_
- Optimized the App grid's loading performance, especially for datasets with
  large samples `#3137 <https://github.com/voxel51/fiftyone/pull/3137>`_
- Improved the usability of the
  :ref:`field visibility modal <app-field-visibility>`
  `#3154 <https://github.com/voxel51/fiftyone/pull/3154>`_
- Added support for visualizing Label fields stored within dynamic embedded
  documents `#3141 <https://github.com/voxel51/fiftyone/pull/3141>`_
- Added support for coloring embeddings plots by list fields
  `#3230 <https://github.com/voxel51/fiftyone/pull/3230>`_
- Added a `proxy_url` setting to the
  :ref:`App config <configuring-fiftyone-app>` that allows for overriding the
  server URL `#3222 <https://github.com/voxel51/fiftyone/pull/3222>`_
- Added support for configuring :ref:`custom colors <app-color-schemes>` for
  sample tags `#3171 <https://github.com/voxel51/fiftyone/pull/3171>`_
- Fixed a bug that caused the point cloud selector from disappearing
  `#3200 <https://github.com/voxel51/fiftyone/pull/3200>`_
- Fixed various minor bugs when viewing
  :ref:`dynamic groups <app-dynamic-groups>` in the App
  `#3172 <https://github.com/voxel51/fiftyone/pull/3172>`_

Core

- Methods like
  :meth:`tag_labels() <fiftyone.core.collections.SampleCollection.tag_labels>`,
  :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`,
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`, and
  :meth:`draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
  now automatically detect and properly handle label fields stored within
  embedded documents
  `#3152 <https://github.com/voxel51/fiftyone/pull/3152>`_
- All |Document| objects now support ``doc["nested.field"]`` key access
  `#3152 <https://github.com/voxel51/fiftyone/pull/3152>`_
- Dynamic field detection now automatically detects dynamic attributes of list
  fields with inhomogeneous values
  `#3152 <https://github.com/voxel51/fiftyone/pull/3152>`_
- Fixed a bug that would cause dynamic field schema methods to erroneously
  declare subfields of |Polyline| points
  `#3152 <https://github.com/voxel51/fiftyone/pull/3152>`_
- Fixed a bug when applying
  :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` to
  video dataset views
  `#3159 <https://github.com/voxel51/fiftyone/pull/3159>`_

Plugins

- Added support for rendering markdown-style tables using the Operator table
  view type `#3162 <https://github.com/voxel51/fiftyone/pull/3162>`_
- Added support for multiselect to the Operator string type
  `#3192 <https://github.com/voxel51/fiftyone/pull/3192>`_
- Added `--all` flags to plugin CLI methods
  `#3177 <https://github.com/voxel51/fiftyone/pull/3177>`_
- Placements and on-startup hooks are now omitted for disabled Operators
  `#3175 <https://github.com/voxel51/fiftyone/pull/3175>`_
- Fixed a bug with `read_only=True` mode for certain Operator view types
  `#3225 <https://github.com/voxel51/fiftyone/pull/3225>`_

Annotation

- Added support for CVAT's `frame_start`, `frame_stop`, and `frame_step`
  options when creating annotation tasks
  `#3181 <https://github.com/voxel51/fiftyone/pull/3181>`_

.. _release-notes-teams-v1.3.0:

FiftyOne Teams 1.3.0
--------------------
*Released May 31, 2023*

Includes all features from :ref:`FiftyOne 0.21.0 <release-notes-v0.21.0>`,
plus:

General

- Added a :ref:`Management SDK <teams-management-sdk>` subpackage for
  programmatically configuring user roles, dataset permissions, plugins, and
  more
- Added support for authenticated :ref:`API connections <teams-api-connection>`
  when using the Python SDK that respect user roles, dataset permissions, etc
- Logins now automatically redirect back to the page you were trying to access
- Improved non-persistent dataset cleanup behavior
- Fixed a bug that could cause the media cache to erroneously garbage collect
  large files while they are downloading
- Fixed a bug when cloning views into new datasets via the Teams UI

Admin

- Added support for :ref:`uploading and managing plugins <teams-plugins>` via
  the Teams UI
- Added support for cross account IAM roles when configuring cloud storage
  credentials
- Fixed a bug that prevented Azure/MinIO credentials uploaded via the Teams UI
  from being properly recognized by the App

.. _release-notes-v0.21.0:

FiftyOne 0.21.0
---------------
*Released May 31, 2023*

App

- Added support for viewing and executing operators in the App!
  `#2679 <https://github.com/voxel51/fiftyone/pull/2679>`_
- Added support for creating :ref:`dynamic groups <app-dynamic-groups>` in the
  App `#2934 <https://github.com/voxel51/fiftyone/pull/2934>`_
- Added support for overlaying multiple point cloud slices in Looker3D
  `#2912 <https://github.com/voxel51/fiftyone/pull/2912>`_
- Added support for customizing the App :ref:`color scheme <app-color-schemes>`
  via a new color scheme modal
  `#2824 <https://github.com/voxel51/fiftyone/pull/2824>`_
- Added support for configuring :ref:`field visibility <app-field-visibility>`
  in the App's sidebar
  `#2924 <https://github.com/voxel51/fiftyone/pull/2924>`_,
  `#3024 <https://github.com/voxel51/fiftyone/pull/3024>`_
- Added support for visualizing |Label| fields stored within top-level embedded
  document fields `#2885 <https://github.com/voxel51/fiftyone/pull/2885>`_
- Optimized App loading for datasets with large sample documents
  `#3139 <https://github.com/voxel51/fiftyone/pull/3139>`_
- Optimized App routes that involve synchronous computations
  `#3066 <https://github.com/voxel51/fiftyone/pull/3066>`_
- Fixed a URL filepath bug that could cause orthographic projections to fail to
  render `#3122 <https://github.com/voxel51/fiftyone/pull/3122>`_
- Fixed a layout bug when working with long brain keys in the Embeddings panel
  `#3026 <https://github.com/voxel51/fiftyone/pull/3026>`_
- Added a welcome message that displays when the App is launched for the first
  time with a new FiftyOne version
  `#3092 <https://github.com/voxel51/fiftyone/pull/3092>`_

Core

- Added support for creating :ref:`dynamic grouped views <view-groups>`
  `#2475 <https://github.com/voxel51/fiftyone/pull/2475>`_
- Added support for storing
  :ref:`default color schemes <dataset-app-config-color-scheme>` for datasets
  `#2824 <https://github.com/voxel51/fiftyone/pull/2824>`_
- Added support for selecting/excluding fields via dynamically defined filters
  via
  :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
  and
  :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
  `#2898 <https://github.com/voxel51/fiftyone/pull/2898>`_
- Added support for :ref:`evaluating keypoints <evaluating-detections>`
  `#2776 <https://github.com/voxel51/fiftyone/pull/2776>`_,
  `#2928 <https://github.com/voxel51/fiftyone/pull/2928>`_
- Added support for computing DICE score when evaluating segmentations
  `#2777 <https://github.com/voxel51/fiftyone/pull/2777>`_,
  `#2901 <https://github.com/voxel51/fiftyone/pull/2901>`_
- Added a new
  :meth:`list_schema() <fiftyone.core.collections.SampleCollection.list_schema>`
  aggregation for inferring the contents of nested list fields
  `#2882 <https://github.com/voxel51/fiftyone/pull/2882>`_
- Added support for declaring dynamic nested list fields
  `#2882 <https://github.com/voxel51/fiftyone/pull/2882>`_
- Handling missing label fields when deleting labels
  `#2918 <https://github.com/voxel51/fiftyone/pull/2918>`_
- Only match .txt files when reading YOLO labels
  `#3127 <https://github.com/voxel51/fiftyone/pull/3127>`_
- Improved behavior of
  :func:`transform_images() <fiftyone.utils.image.transform_images>` and
  :func:`transform_videos() <fiftyone.utils.video.transform_videos>` utilities
  when processing media in-place
  `#2931 <https://github.com/voxel51/fiftyone/pull/2931>`_
- Added utils and helpful warnings that advise how to patch broken saved views
  and runs `#2970 <https://github.com/voxel51/fiftyone/pull/2970>`_,
  `#2971 <https://github.com/voxel51/fiftyone/pull/2971>`_
- Replaced `pkg_resources` with `importlib.metadata`
  `#2930 <https://github.com/voxel51/fiftyone/pull/2930>`_

Plugins

- Added :ref:`Operators <fiftyone-operators>` to the plugin framework
  `#2679 <https://github.com/voxel51/fiftyone/pull/2679>`_
- Added CLI methods for :ref:`plugins <cli-fiftyone-plugins>` and
  :ref:`operators <cli-fiftyone-operators>`
  `#3025 <https://github.com/voxel51/fiftyone/pull/3025>`_,
  `#3038 <https://github.com/voxel51/fiftyone/pull/3038>`_

Annotation

- Added support for CVAT 2.4
  `#2959 <https://github.com/voxel51/fiftyone/pull/2959>`_
- Added support for importing/exporting instances when using the Label Studio
  integration `#2706 <https://github.com/voxel51/fiftyone/pull/2706>`_,
  `#2917 <https://github.com/voxel51/fiftyone/pull/2917>`_
- Added support for importing multiclass classifications from Scale
  `#3117 <https://github.com/voxel51/fiftyone/pull/3117>`_
- Updated Scale integration to assume that imported line annotations are not
  closed shapes `#3123 <https://github.com/voxel51/fiftyone/pull/3123>`_
- Fixed broken Scale docs links and unlabeled annotation task support
  `#2916 <https://github.com/voxel51/fiftyone/pull/2916>`_

Zoo

- Added the :ref:`Sama-COCO dataset <dataset-zoo-sama-coco>` to the zoo!
  `#2904 <https://github.com/voxel51/fiftyone/pull/2904>`_

Tutorials

- Updated detection mistakes tutorial to avoid unnecessarily resetting the App
  `#3034 <https://github.com/voxel51/fiftyone/pull/3034>`_

.. _release-notes-teams-v1.2.1:

FiftyOne Teams 1.2.1
--------------------
*Released April 5, 2023*

Includes all features from :ref:`FiftyOne 0.20.1 <release-notes-v0.20.1>`,
plus:

General

- When your session expires, you are now automatically logged out rather than
  being presented with a cryptic server error
- Improved the accuracy of size estimates when exporting filepaths and/or tags
  from the Teams UI

Admin

- Added support for uploading Azure storage credentials for your deployment via
  the `Settings > Cloud storage` page

SDK

- Added support for working with media in Azure cloud storage. Refer to
  :ref:`this section <teams-azure>` to see how to provide your storage
  credentials

Deployment

- Added support for deploying into Microsoft Azure environments
- Fixed a bug that prevented the dataset page from loading for deployments
  running MongoDB 4.4

.. _release-notes-v0.20.1:

FiftyOne 0.20.1
---------------
*Released April 5, 2023*

App

- Added support for storing datetimes as field metadata and viewing them in the
  App's field tooltip
  `#2861 <https://github.com/voxel51/fiftyone/pull/2861>`_
- Fixed a bug when pulling color-by data for sample embeddings plots when
  viewing patches in the sample grid
  `#2846 <https://github.com/voxel51/fiftyone/pull/2846>`_
- Fixed a bug that prevented the sample grid from refreshing when composing
  multiple sidebar filters
  `#2849 <https://github.com/voxel51/fiftyone/pull/2849>`_
- Fixed a bug that prevented field-specific mask targets from being recognized
  when rendering segmentations in the App
  `#2879 <https://github.com/voxel51/fiftyone/pull/2879>`_
- Fixed a bug when rendering heatmaps stored as images on disk
  `#2872 <https://github.com/voxel51/fiftyone/pull/2872>`_,
  `#2880 <https://github.com/voxel51/fiftyone/pull/2880>`_

Core

- Added support for dynamically inferring fields on embedded lists and
  documents
  `#2863 <https://github.com/voxel51/fiftyone/pull/2863>`_,
  `#2882 <https://github.com/voxel51/fiftyone/pull/2882>`_
- Added support for listing datasets matching a glob pattern
  `#2868 <https://github.com/voxel51/fiftyone/pull/2868>`_
- Improved the robustness of
  :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` when
  cleaning up after a failed merge
  `#2844 <https://github.com/voxel51/fiftyone/pull/2844>`_
- Using new libraries for ndjson and archive extraction
  `#2864 <https://github.com/voxel51/fiftyone/pull/2864>`_
- Fixed a bug that prevented
  :ref:`text similarity searches <brain-similarity-text>` searches from
  succeeding when GPU is available
  `#2853 <https://github.com/voxel51/fiftyone/pull/2853>`_
- Fixed a bug where
  :meth:`stats() <fiftyone.core.collections.SampleCollection.stats>` would
  report the wrong size for dataset views that select/exclude fields on MongoDB
  5.2 or later
  `#2840 <https://github.com/voxel51/fiftyone/pull/2840>`_
- Fixed a bug with dynamic schema expansion of list fields
  `#2855 <https://github.com/voxel51/fiftyone/pull/2855>`_
- Fixed a bug when merging video samples into a grouped dataset that did not
  previously contain videos
  `#2851 <https://github.com/voxel51/fiftyone/pull/2851>`_
- Fixed a validation bug when importing COCO datasets whose description is not
  a string `#2848 <https://github.com/voxel51/fiftyone/pull/2848>`_

Documentation

- Updated the source URLs for the :ref:`Caltech-101 <dataset-zoo-caltech101>`
  and :ref:`Caltech-256 <dataset-zoo-caltech256>` datasets
  `#2841 <https://github.com/voxel51/fiftyone/pull/2841>`_
- Fixed a typo in the :ref:`Caltech-256 <dataset-zoo-caltech256>` dataset
  documentation `#2842 <https://github.com/voxel51/fiftyone/pull/2842>`_

.. _release-notes-teams-v1.2:

FiftyOne Teams 1.2
------------------
*Released March 22, 2023*

Includes all features from :ref:`FiftyOne 0.20.0 <release-notes-v0.20.0>`,
plus:

Admin settings

- Admins who use SSO to authorize new users to auto-join their FiftyOne Teams
  deployment can now configure the :ref:`default role <teams-roles>` for those
  users
- Admins can now configure the
  :ref:`default access level <teams-default-access>` that Members receive on
  newly created datasets Dataset page

Dataset page

- Added support for viewing :ref:`Segmentation <semantic-segmentation>` and
  :ref:`Heatmap <heatmaps>` data stored as images in the cloud in the App
- Added support for exporting one or more fields of a dataset in CSV format
  through the Teams UI
- Stack traces for unhandled errors are now presented directly in the App so
  that users can self-diagnose issues

Deployment

- Added support for sharded databases

.. _release-notes-v0.20.0:

FiftyOne 0.20.0
---------------
*Released March 22, 2023*

News

- Added support for querying by
  :ref:`arbitrary text prompts <brain-similarity-text>` in the App!
  `#2633 <https://github.com/voxel51/fiftyone/pull/2633>`_
- Released a :ref:`Qdrant integration <qdrant-integration>` for native text and
  image searches on FiftyOne datasets!
- Released a :ref:`Pinecone integration <pinecone-integration>` for native text
  and image searches on FiftyOne datasets!

App

- Switched the default :ref:`sidebar mode <app-sidebar-mode>` to ``fast``
  `#2714 <https://github.com/voxel51/fiftyone/pull/2714>`_
- Refactored sample/label tags in the App so that they are treated the same as
  any other list field `#2557 <https://github.com/voxel51/fiftyone/pull/2557>`_
- Added support for visualizing
  :ref:`orthographic projection images <orthographic-projection-images>` for
  point cloud datasets/slices
  `#2660 <https://github.com/voxel51/fiftyone/pull/2660>`_
- Added a filter/selection indicator to the title of all Panels that can be
  clicked to clear the Panel's current state
  `#2652 <https://github.com/voxel51/fiftyone/pull/2652>`_
- Any selection state associated with a Panel is now automatically cleared when
  the Panel is closed
  `#2652 <https://github.com/voxel51/fiftyone/pull/2652>`_
- Added a button to the saved view selector for clearing the current view
  `#2661 <https://github.com/voxel51/fiftyone/pull/2661>`_
- Added support for maximizing/hiding individual panels of the grouped modal
  `#2688 <https://github.com/voxel51/fiftyone/pull/2688>`_
- Added support for switching between multiple point cloud slices
  `#2675 <https://github.com/voxel51/fiftyone/pull/2675>`_
- Added keyboard shortcuts for opening Panels directly in split mode
  `#2663 <https://github.com/voxel51/fiftyone/pull/2663>`_
- Upgraded Looker3D controls
  `#2753 <https://github.com/voxel51/fiftyone/pull/2753>`_
- Upgraded the modal's JSON viewer
  `#2677 <https://github.com/voxel51/fiftyone/pull/2677>`_
- Selected labels are not reset after applying a
  :ref:`similarity search <app-similarity>`
  `#2820 <https://github.com/voxel51/fiftyone/pull/2820>`_
- Stack traces for unhandled errors are now presented directly in the App so
  that users can self-diagnose issues
  `#2795 <https://github.com/voxel51/fiftyone/pull/2795>`_,
  `#2797 <https://github.com/voxel51/fiftyone/pull/2797>`_
- Improved error handling when loading invalid/missing brain results in the
  :ref:`Embeddings panel <app-embeddings-panel>`
  `#2651 <https://github.com/voxel51/fiftyone/pull/2651>`_,
  `#2790 <https://github.com/voxel51/fiftyone/pull/2790>`_
- More intuitive behavior when combining Embedding panel selections and sidebar
  filters `#2741 <https://github.com/voxel51/fiftyone/pull/2741>`_
- Ensure that URL is updated when loading saved views via a Python session
  `#2740 <https://github.com/voxel51/fiftyone/pull/2740>`_
- Switched to wildcard-based string matching in the sidebar
  `#2736 <https://github.com/voxel51/fiftyone/pull/2736>`_
- Plugins can now load components and utilities from runtime instead of
  compiling their own `#2680 <https://github.com/voxel51/fiftyone/pull/2680>`_
- Stability improvements when loading and handling errors in plugins
  `#2758 <https://github.com/voxel51/fiftyone/pull/2758>`_
- Informative error messages are now displayed when visualization results fail
  to load in the Embeddings panel
  `#2751 <https://github.com/voxel51/fiftyone/pull/2751>`_
- Resolved some edge cases when loading views with different schemas via Python
  sessions `#2730 <https://github.com/voxel51/fiftyone/pull/2730>`_
- Fixed a bug that would cause saving views to intermittently fail
  `#2667 <https://github.com/voxel51/fiftyone/pull/2667>`_
- Fixed a bug when using saved views with Python <3.9 in the App
  `#2676 <https://github.com/voxel51/fiftyone/pull/2676>`_,
  `#2728 <https://github.com/voxel51/fiftyone/pull/2728>`_
- Fixed a bug that could cause App crashes when loading
  :class:`SelectGroupSlices <fiftyone.core.stages.SelectGroupSlices>` stages in
  the view bar
  `#2669 <https://github.com/voxel51/fiftyone/pull/2669>`_,
  `#2743 <https://github.com/voxel51/fiftyone/pull/2743>`_
- Fixed a bug that could cause App crashes when filtering keypoints
  `#2774 <https://github.com/voxel51/fiftyone/pull/2774>`_,
  `#2779 <https://github.com/voxel51/fiftyone/pull/2779>`_
- Fixed a bug when lassoing patch embeddings with the Map panel open
  `#2754 <https://github.com/voxel51/fiftyone/pull/2754>`_
- Fixed inconsistencies with selection, tagging, active slices, and sidebar
  stats in the modal for grouped datasets
  `#2785 <https://github.com/voxel51/fiftyone/pull/2785>`_,
  `#2782 <https://github.com/voxel51/fiftyone/pull/2782>`_,
  `#2769 <https://github.com/voxel51/fiftyone/pull/2769>`_,
  `#2759 <https://github.com/voxel51/fiftyone/pull/2759>`_,
  `#2749 <https://github.com/voxel51/fiftyone/pull/2749>`_,
  `#2731 <https://github.com/voxel51/fiftyone/pull/2731>`_
- Fixed a bug when pressing enter twice in a label tag popover
  `#2757 <https://github.com/voxel51/fiftyone/pull/2757>`_
- Fixed a bug where keyboard listeners in the modal would interfere with other
  input interactions
  `#2786 <https://github.com/voxel51/fiftyone/pull/2786>`_
- Fixed a bug where some users would see erroneous scrollbars
  `#2794 <https://github.com/voxel51/fiftyone/pull/2794>`_
- Fixed bugs when tagging labels in the grouped modal
  `#2820 <https://github.com/voxel51/fiftyone/pull/2820>`_
- Fixed a bug when retrieving values for filter dropdowns in the grouped modal
  `#2817 <https://github.com/voxel51/fiftyone/pull/2817>`_
- Fixed a bug that would raise an App error after deleting certain saved views
  `#2801 <https://github.com/voxel51/fiftyone/pull/2801>`_
- Fixed the formatting of the ``support`` field in the modal sidebar for clip
  views
  `#2800 <https://github.com/voxel51/fiftyone/pull/2800>`_
- Fixed a bug with URL rendering in the sidebar
  `#2735 <https://github.com/voxel51/fiftyone/pull/2735>`_
- Fixed a bug when streaming filtered frame labels
  `#2682 <https://github.com/voxel51/fiftyone/pull/2682>`_,
  `#2733 <https://github.com/voxel51/fiftyone/pull/2733>`_
- Fixed a bug when adding new tags to a selected sample or label
  `#2703 <https://github.com/voxel51/fiftyone/pull/2703>`_
- Fixed a bug when matching by tags that contain spaces
  `#2658 <https://github.com/voxel51/fiftyone/pull/2658>`_

Core

- Added support for querying by vectors and text prompts
  `#2569 <https://github.com/voxel51/fiftyone/pull/2569>`_
- Upgraded the :ref:`similarity index interface <brain-similarity>`, including
  :ref:`Qdrant <qdrant-integration>` and :ref:`Pinecone <pinecone-integration>`
  support, and the ability to add/remove embeddings to an existing index
  `#2792 <https://github.com/voxel51/fiftyone/pull/2792>`_
- Added support for storing and visualizing cuboids and rotated bounding boxes
  in the App `#2296 <https://github.com/voxel51/fiftyone/pull/2296>`_
- Added support for :ref:`evaluating <evaluating-detections>` 3D object
  detections `#2486 <https://github.com/voxel51/fiftyone/pull/2486>`_
- Added a
  :meth:`to_trajectories() <fiftyone.core.collections.SampleCollection.to_trajectories>`
  view stage `#1300 <https://github.com/voxel51/fiftyone/pull/1300>`_
- Added support for generating
  :ref:`orthographic projection images <orthographic-projection-images>` for
  point cloud datasets/slices
  `#2656 <https://github.com/voxel51/fiftyone/pull/2656>`_
- Added validation to :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  `#2770 <https://github.com/voxel51/fiftyone/pull/2770>`_
- Frame collections are now lazily created only when necessary
  `#2727 <https://github.com/voxel51/fiftyone/pull/2727>`_
- Upgraded the document save implementaton to only use upsert operations when
  explicitly required
  `#2727 <https://github.com/voxel51/fiftyone/pull/2727>`_
- Added ``_dataset_id`` to all sample/frame documents in datasets
  `#2711 <https://github.com/voxel51/fiftyone/pull/2711>`_
- Added a :meth:`save() <fiftyone.core.runs.RunResults.save>` and
  :meth:`save_config() <fiftyone.core.runs.RunResults.save_config>` methods to
  :class:`RunResults <fiftyone.core.runs.RunResults>`
  `#2696 <https://github.com/voxel51/fiftyone/pull/2696>`_,
  `#2772 <https://github.com/voxel51/fiftyone/pull/2772>`_
- Added support for renaming existing runs via new
  :meth:`rename_annotation_run() <fiftyone.core.collections.SampleCollection.rename_annotation_run>`,
  :meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`, and
  :meth:`rename_evaluation() <fiftyone.core.collections.SampleCollection.rename_evaluation>`
  methods `#2696 <https://github.com/voxel51/fiftyone/pull/2696>`_
- Added support for filtering by run type and config parameters when using
  :meth:`list_annotation_runs() <fiftyone.core.collections.SampleCollection.list_annotation_runs>`,
  :meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`, and
  :meth:`list_evaluations() <fiftyone.core.collections.SampleCollection.list_evaluations>`
  `#2696 <https://github.com/voxel51/fiftyone/pull/2696>`_,
  `#2772 <https://github.com/voxel51/fiftyone/pull/2772>`_
- Added an :meth:`add_group_slice() <fiftyone.core.dataset.Dataset.add_group_slice>`
  method to declare new slices on grouped datasets
  `#2727 <https://github.com/voxel51/fiftyone/pull/2727>`_
- Added support for controlling whether saved views and runs are
  imported/exported in :ref:`FiftyOneDataset format <FiftyOneDataset-import>`
  `#2806 <https://github.com/voxel51/fiftyone/pull/2806>`_
- Added support for negative integer mask targets
  `#2686 <https://github.com/voxel51/fiftyone/pull/2686>`_
- Downward migrations for future-but-compatible versions of FiftyOne are now
  skipped rather than raising an error
  `#2683 <https://github.com/voxel51/fiftyone/pull/2683>`_
- Fixed a bug when cloning datasets with run results
  `#2772 <https://github.com/voxel51/fiftyone/pull/2772>`_
- Fixed a bug with the `dynamic=True` syntax for declaring dynamic fields on
  list documents
  `#2767 <https://github.com/voxel51/fiftyone/pull/2767>`_
- Fixed a bug in deferred saves where filtered list updates were not being
  applied `#2727 <https://github.com/voxel51/fiftyone/pull/2727>`_

Annotation

- Added support for passing CVAT organization to annotation jobs
  `#2716 <https://github.com/voxel51/fiftyone/pull/2716>`_

Docs

- Added :ref:`documentation <point-cloud-datasets>` for working with point
  cloud-only datasets
  `#2724 <https://github.com/voxel51/fiftyone/pull/2724>`_
- Added :ref:`documentation <custom-embedded-documents>` for on-the-fly custom
  embedded document creation
  `#2687 <https://github.com/voxel51/fiftyone/pull/2687>`_
- Fixed broken torchvision dataset links in the docs
  `#2771 <https://github.com/voxel51/fiftyone/pull/2771>`_

Zoo

- Added a ``tensorflow-macos`` option when loading TF models from the
  :ref:`Model Zoo <model-zoo>`
  `#2685 <https://github.com/voxel51/fiftyone/pull/2685>`_

Tutorials

- Added a :doc:`Point-E tutorial </tutorials/pointe>` showcasing the 3D
  Visualizer's capabilities in the context of building a 3D self-driving
  dataset `#2818 <https://github.com/voxel51/fiftyone/pull/2818>`_
- Added a :doc:`YOLOv8 tutorial </tutorials/yolov8>`
  `#2755 <https://github.com/voxel51/fiftyone/pull/2755>`_
- Updated the media in the :doc:`Open Images tutorial </tutorials/open_images>`
  `#2665 <https://github.com/voxel51/fiftyone/pull/2665>`_

.. _release-notes-teams-v1.1.1:

FiftyOne Teams 1.1.1
--------------------
*Released February 14, 2023*

Includes all features from :ref:`FiftyOne 0.19.1 <release-notes-v0.19.1>`,
plus:

Plugins

- Resolved a bug that prevented Teams deployments from recognizing installed
  plugins

.. _release-notes-v0.19.1:

FiftyOne 0.19.1
---------------
*Released February 14, 2023*

App

- Fixed a bug when launching the App in Python 3.8 or earlier
  `#2647 <https://github.com/voxel51/fiftyone/pull/2647>`_
- Fixed a bug that prevented launching the App in Databricks notebooks
  `#2647 <https://github.com/voxel51/fiftyone/pull/2647>`_

Core

- Fixed a bug in certain environments that prevented progress bars from
  rendering correctly
  `#2647 <https://github.com/voxel51/fiftyone/pull/2647>`_

.. _release-notes-teams-v1.1:

FiftyOne Teams 1.1
------------------
*Released February 9, 2023*

Includes all features from :ref:`FiftyOne 0.19.0 <release-notes-v0.19.0>`,
plus:

User roles

- Renamed the existing Guest role to
  `Collaborator <https://docs.voxel51.com/teams/roles_and_permissions.html#collaborator>`_
- Added a new
  `Guest <https://docs.voxel51.com/teams/roles_and_permissions.html#guest>`_
  role. Note that Guest is a view-only role and does not contribute to your
  license count. You can add unlimited Guest users to your deployment!

Homepage

- Added a Recent views widget to the homepage that shows the most recent saved
  views that you have viewed in the Teams UI

Dataset page

- Added support for cloning the current view (including any filters,
  selections, etc) into a new dataset from the UI
- Added support for exporting the current view to local disk or a cloud bucket
  in various formats (filepaths only, filepaths and tags, media only, labels
  only, media and labels)

Deployment

- Added support for deploying Teams into environments with proxy networks

.. _release-notes-v0.19.0:

FiftyOne 0.19.0
---------------
*Released February 9, 2023*

News

- :ref:`FiftyOne Teams <fiftyone-teams>` documentation is now publicly
  available! `#2388 <https://github.com/voxel51/fiftyone/pull/2388>`_

App

- Added the :ref:`Spaces framework <app-spaces>`
  `#2524 <https://github.com/voxel51/fiftyone/pull/2524>`_
- Added native support for
  :ref:`visualizing embeddings <app-embeddings-panel>`
  `#2524 <https://github.com/voxel51/fiftyone/pull/2524>`_
- Refactored the map tab into a dedicated :ref:`map panel <app-map-panel>`
  `#2524 <https://github.com/voxel51/fiftyone/pull/2524>`_
- Refactored the histograms tab into a dedicated
  :ref:`histograms panel <app-histograms-panel>`
  `#2524 <https://github.com/voxel51/fiftyone/pull/2524>`_
- Added support for :ref:`loading and saving views <app-saving-views>`
  `#2461 <https://github.com/voxel51/fiftyone/pull/2461>`_
- Added support for visualizing |Segmentation| and |Heatmap| masks stored on
  disk `#2358 <https://github.com/voxel51/fiftyone/pull/2358>`_
- Added support for visualizing RGB segmentations
  `#2483 <https://github.com/voxel51/fiftyone/pull/2483>`_
- Added retries for all network requests to improve stability
  `#2406 <https://github.com/voxel51/fiftyone/pull/2406>`_
- Optimized the tagging menu
  `#2368 <https://github.com/voxel51/fiftyone/pull/2368>`_
- Optimized sample tagging on video datasets
  `#2440 <https://github.com/voxel51/fiftyone/pull/2440>`_
- Don't refresh the background grid when applying tags in the modal
  `#2594 <https://github.com/voxel51/fiftyone/pull/2594>`_
- Only show supported keys in the evaluations dropdown
  `#2427 <https://github.com/voxel51/fiftyone/pull/2427>`_
- Fixed handling of None values when filtering numeric/list fields
  `#2422 <https://github.com/voxel51/fiftyone/pull/2422>`_,
  `#2412 <https://github.com/voxel51/fiftyone/pull/2412>`_,
  `#2403 <https://github.com/voxel51/fiftyone/pull/2403>`_
- Never show expanded filter list for ID fields
  `#2408 <https://github.com/voxel51/fiftyone/pull/2408>`_
- Ensure that the bookmark icon displays when extended selections exist
  `#2366 <https://github.com/voxel51/fiftyone/pull/2366>`_
- Automatically clear sample selection after
  :ref:`sorting by similarity <app-similarity>`
  `#2595 <https://github.com/voxel51/fiftyone/pull/2595>`_
- Use consistent loading dots throughout the App
  `#2321 <https://github.com/voxel51/fiftyone/pull/2321>`_
- Fixed a bug when filtering by custom embedded list fields
  `#2407 <https://github.com/voxel51/fiftyone/pull/2407>`_
- Fixed bugs when screenshotting the App in notebook contexts
  `#2398 <https://github.com/voxel51/fiftyone/pull/2398>`_
- Fixed bugs when launching the App in Databricks notebooks
  `#2397 <https://github.com/voxel51/fiftyone/pull/2397>`_
- Show metadata for frame-level fields in the fields tooltip
  `#2386 <https://github.com/voxel51/fiftyone/pull/2386>`_
- Fixed bugs when configuring plugin settings and modal media fields
  `#2383 <https://github.com/voxel51/fiftyone/pull/2383>`_
- Fixed bugs with multiple media fields when loading views that exclude fields
  `#2378 <https://github.com/voxel51/fiftyone/pull/2378>`_,
  `#2303 <https://github.com/voxel51/fiftyone/pull/2303>`_

Core

- Added support for programmatically
  :ref:`configuring space layouts <app-spaces-python>`
  `#2524 <https://github.com/voxel51/fiftyone/pull/2524>`_
- Added support for :ref:`loading and saving views <saving-views>`
  `#2461 <https://github.com/voxel51/fiftyone/pull/2461>`_
- Added support for storing |Segmentation| and |Heatmap| masks on disk
  `#2301 <https://github.com/voxel51/fiftyone/pull/2301>`_
- Added support for RGB segmentations in
  :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
  `#2483 <https://github.com/voxel51/fiftyone/pull/2483>`_
- Added a new
  :func:`transform_segmentations() <fiftyone.utils.labels.transform_segmentations>`
  utility `#2483 <https://github.com/voxel51/fiftyone/pull/2483>`_
- Added support for declaring dynamic fields on generated views via
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  `#2513 <https://github.com/voxel51/fiftyone/pull/2513>`_
- Added support for :ref:`importing <CSVDataset-import>` and
  :ref:`exporting <CSVDataset-export>` datasets in CSV format
  `#2616 <https://github.com/voxel51/fiftyone/pull/2616>`_,
  `#2450 <https://github.com/voxel51/fiftyone/pull/2450>`_
- Added support for :ref:`importing <MediaDirectory-import>` and
  :ref:`exporting <MediaDirectory-export>` directories of arbitrary media files
  `#2605 <https://github.com/voxel51/fiftyone/pull/2605>`_
- Added a dedicated
  :meth:`clear_cache() <fiftyone.core.dataset.Dataset.clear_cache>` method for
  clearing a dataset's run cache
  `#2471 <https://github.com/voxel51/fiftyone/pull/2471>`_
- Updated all plotting methods, eg
  :meth:`scatterplot() <fiftyone.core.plots.base.scatterplot>` to always rely
  on sample/label IDs when pulling data for plots
  `#2614 <https://github.com/voxel51/fiftyone/pull/2614>`_
- Updated
  :meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
  to store patch embeddings directly on |Label| objects when the
  ``embeddings_field`` argument is provided
  `#2626 <https://github.com/voxel51/fiftyone/pull/2626>`_
- Added support for passing frame-level fields directly to
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
  `#2418 <https://github.com/voxel51/fiftyone/pull/2418>`_
- Added an optional `dynamic=True` flag to
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  `#2372 <https://github.com/voxel51/fiftyone/pull/2372>`_
- Added support for declaring custom |Label| attributes via
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  `#2372 <https://github.com/voxel51/fiftyone/pull/2372>`_
- Adds a new
  :meth:`set_label_values() <fiftyone.core.collections.SampleCollection.set_label_values>`
  utility for setting attributes on |Label| instances by their IDs
  `#2372 <https://github.com/voxel51/fiftyone/pull/2372>`_
- Always update dataset's `last_loaded_at` property when they are loaded
  `#2375 <https://github.com/voxel51/fiftyone/pull/2375>`_
- Migrated runs to a separate database collection, for efficiency
  `#2189 <https://github.com/voxel51/fiftyone/pull/2189>`_
- Added an :func:`exact_frame_count() <fiftyone.utils.video.exact_frame_count>`
  utility for computing extact video frame counts
  `#2373 <https://github.com/voxel51/fiftyone/pull/2373>`_
- Updated the :ref:`3D visualizer <3d-detections>` to use true centroid (not
  bottom-center) coordinates for 3D detections
  `#2474 <https://github.com/voxel51/fiftyone/pull/2474>`_
- Added support for loading specific group slice(s) when using
  :meth:`iter_groups() <fiftyone.core.collections.SampleCollection.iter_groups>`
  and
  :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
  `#2528 <https://github.com/voxel51/fiftyone/pull/2528>`_
- Added an
  :meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`
  view stage `#2451 <https://github.com/voxel51/fiftyone/pull/2451>`_
- Added support for importing annotations directly on grouped datasets
  `#2349 <https://github.com/voxel51/fiftyone/pull/2349>`_
- Added a :func:`group_collections() <fiftyone.utils.groups.group_collections>`
  utility for merging multiple collections into a grouped dataset
  `#2332 <https://github.com/voxel51/fiftyone/pull/2332>`_
- Added support for converting an existing dataset into a grouped dataset via
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  `#2332 <https://github.com/voxel51/fiftyone/pull/2332>`_
- Added support for deleting grouped fields when the dataset contains only one
  media type `#2332 <https://github.com/voxel51/fiftyone/pull/2332>`_
- Updated :meth:`Dataset.stats() <fiftyone.core.dataset.Dataset.stats>` to
  include media from all slices of grouped datasets
  `#2635 <https://github.com/voxel51/fiftyone/pull/2635>`_
- Fixed a bug when calling
  :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>` on
  a view that filters the frames of the input dataset
  `#2361 <https://github.com/voxel51/fiftyone/pull/2361>`_
- Fixed some bugs when passing multiple aggregations with the same field name
  and type to
  :meth:`aggregate() <fiftyone.core.collections.SampleCollection.aggregate>`
  `#2617 <https://github.com/voxel51/fiftyone/pull/2617>`_
- Fixed a bug when manually unwinding list fields in aggregations
  `#2608 <https://github.com/voxel51/fiftyone/pull/2608>`_
- Fixed a bug when loading datasets with CVAT attributes stored in
  :ref:`VOC format <VOCDetectionDataset-import>`
  `#2359 <https://github.com/voxel51/fiftyone/pull/2359>`_
- Fixed a bug in default sidebar group expansion
  `#2441 <https://github.com/voxel51/fiftyone/pull/2441>`_

Annotation

- Added support for CVAT 2.4
  `#2597 <https://github.com/voxel51/fiftyone/pull/2597>`_
- Added support for providing custom task names for CVAT tasks
  `#2353 <https://github.com/voxel51/fiftyone/pull/2353>`_
- Fixed a bug when checking if CVAT projects exist
  `#2491 <https://github.com/voxel51/fiftyone/pull/2491>`_
- Fixed a bug when checking if CVAT tasks exist
  `#2070 <https://github.com/voxel51/fiftyone/pull/2070>`_

Zoo

- Added :ref:`Open Images V7 <dataset-zoo-open-images-v7>` to the zoo
  `#2446 <https://github.com/voxel51/fiftyone/pull/2446>`_
- Updated the :ref:`KITTI multiview <dataset-zoo-kitti-multiview>` and
  :ref:`quickstart-groups <dataset-zoo-quickstart-groups>` datasets to not use
  legacy 3D visualizer settings
  `#2474 <https://github.com/voxel51/fiftyone/pull/2474>`_
- Added support for filtering datasets when using
  :func:`list_zoo_datasets() <fiftyone.zoo.datasets.list_zoo_datasets>`
  `#2448 <https://github.com/voxel51/fiftyone/pull/2448>`_

Docs

- Added detailed :ref:`plugin documentation <fiftyone-plugins>`
  `#2442 <https://github.com/voxel51/fiftyone/pull/2442>`_
- Added :ref:`documentation <label-conversions>` for converting between common
  label formats `#2498 <https://github.com/voxel51/fiftyone/pull/2498>`_
- Added a :doc:`pandas vs FiftyOne </tutorials/pandas_comparison>` tutorial
  `#2310 <https://github.com/voxel51/fiftyone/pull/2310>`_
- Added a :ref:`pandas vs FiftyOne <pandas-cheat-sheet>` cheat sheet
  `#2329 <https://github.com/voxel51/fiftyone/pull/2329>`_
- Added a :ref:`FiftyOne terminology <terminology-cheat-sheet>` cheat sheet
  `#2484 <https://github.com/voxel51/fiftyone/pull/2484>`_
- Added a :ref:`view stage <views-cheat-sheet>` cheat sheet
  `#2452 <https://github.com/voxel51/fiftyone/pull/2452>`_
- Added a :ref:`filtering <filtering-cheat-sheet>` cheat sheet
  `#2447 <https://github.com/voxel51/fiftyone/pull/2447>`_

.. _release-notes-teams-v1.0:

FiftyOne Teams 1.0
------------------
*Released November 8, 2022*

Includes all features from :ref:`FiftyOne 0.18.0 <release-notes-v0.18.0>`,
plus:

News

- FiftyOne Teams is now generally available,
  :ref:`read more here <fiftyone-teams>`!

.. _release-notes-v0.18.0:

FiftyOne 0.18.0
---------------
*Released November 8, 2022*

App

- Significantly optimized the performance of the sidebar by lazily computing
  statistics only for currently visible fields
  `#2191 <https://github.com/voxel51/fiftyone/pull/2191>`_
- Added new :ref:`sidebar modes <app-sidebar-mode>` with updated default
  behavior that further optimizes the performance of the App for large datasets
  `#2191 <https://github.com/voxel51/fiftyone/pull/2191>`_
- Added support for configuring the :ref:`sidebar mode <app-sidebar-mode>`
  dynamically in the App and programmatically on a per-dataset basis
  `#2191 <https://github.com/voxel51/fiftyone/pull/2191>`_
- Added support for programmatically configuring
  :ref:`sidebar groups <app-sidebar-groups>` and default expansion states on a
  per-dataset basis `#2190 <https://github.com/voxel51/fiftyone/pull/2190>`_
- Added support for viewing field-level descriptions via a new
  :ref:`field tooltip <app-fields-sidebar>`
  `#2216 <https://github.com/voxel51/fiftyone/pull/2216>`_
- Added support for filtering by and viewing stats for custom embedded document
  attributes `#1825 <https://github.com/voxel51/fiftyone/pull/1825>`_
- Added a new light mode option!
  `#2156 <https://github.com/voxel51/fiftyone/pull/2156>`_
- Improved responsiveness of the sidebar when toggling fields on and off
  `#2247 <https://github.com/voxel51/fiftyone/pull/2247>`_
- Improved responsiveness and state management of the view bar
  `#2230 <https://github.com/voxel51/fiftyone/pull/2230>`_
- Restored the ability to shift-select multiple samples in the grid view
  `#2110 <https://github.com/voxel51/fiftyone/issues/2110>`_
- Fixed an issue that could cause unselected label fields to be inadvertently
  tagged when using the label tagging UI
  `#2121 <https://github.com/voxel51/fiftyone/issues/2121>`_
- Fixed an issue that would prevent label tags applied on patch views in the
  tagging UI from persisting to the underlying dataset
  `#2113 <https://github.com/voxel51/fiftyone/issues/2113>`_
- Fixed an issue that could arise when loading a group dataset with sparse
  alternate media fields
  `#2164 <https://github.com/voxel51/fiftyone/issues/2164>`_
- Fixed some issues with datetime rendering and timezone handling
  `#2111 <https://github.com/voxel51/fiftyone/issues/2111>`_,
  `#2112 <https://github.com/voxel51/fiftyone/issues/2112>`_

Core

- Added support for declaring
  :ref:`custom dynamic attributes <dynamic-attributes>` on datasets!
  `#1825 <https://github.com/voxel51/fiftyone/pull/1825>`_
- Added support for storing
  :ref:`field-level metadata <storing-field-metadata>` on datasets
  `#2216 <https://github.com/voxel51/fiftyone/pull/2216>`_
- Added native support for installing on Apple Silicon with MongoDB 6
  `#2165 <https://github.com/voxel51/fiftyone/pull/2165>`_
- Dataset creation using default naming is now multiprocess-safe
  `#2097 <https://github.com/voxel51/fiftyone/pull/2097>`_
- Optimized the implementation of tagging samples and labels
  `#2203 <https://github.com/voxel51/fiftyone/pull/2203>`_,
  `#2208 <https://github.com/voxel51/fiftyone/pull/2208>`_
- Optimized the implementation of
  :meth:`select() <fiftyone.core.collections.SampleCollection.select>`,
  :meth:`select_by() <fiftyone.core.collections.SampleCollection.select_by>`,
  and
  :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
  when performing ordered selections
  `#2227 <https://github.com/voxel51/fiftyone/pull/2227>`_
- Updated the logic of
  :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>` to be
  more intuitive for frame fields
  `#2209 <https://github.com/voxel51/fiftyone/pull/2209>`_
- Upgraded server and MongoDB requirements to `pymongo>=3.11`, `motor>=2.3` and
  newer pinned versions of `mongoengine`, `starlette`, and `strawberry-graphql`
  `#2215 <https://github.com/voxel51/fiftyone/pull/2215>`_
- Added support for modifying the filepaths of a frame view
  `#2193 <https://github.com/voxel51/fiftyone/pull/2193>`_
- Improved the implementation of
  :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` and
  related methods to safely cleanup in case of failed merges
  `#2135 <https://github.com/voxel51/fiftyone/pull/2135>`_
- Fixed some bugs that could occur when creating frame views into grouped
  collections `#2144 <https://github.com/voxel51/fiftyone/pull/2144>`_
- Fixed a bug when using
  :meth:`select_by() <fiftyone.core.collections.SampleCollection.select_by>`
  with `ObjectId` fields
  `#2140 <https://github.com/voxel51/fiftyone/pull/2140>`_
- Added an option to import annotation IDs when loading data stored in
  :ref:`COCO format <COCODetectionDataset-import>`
  `#2122 <https://github.com/voxel51/fiftyone/pull/2122>`_
- Added support for including the export directory in the `dataset.yaml` file
  generated by :ref:`YOLOv5 exports <YOLOv5Dataset-export>`
  `#2114 <https://github.com/voxel51/fiftyone/pull/2114>`_

Annotation

- Updated the default CVAT endpoint to https://app.cvat.ai
  `#2228 <https://github.com/voxel51/fiftyone/pull/2228>`_
- Fixed a bug that would cause annotation runs involving unlabeled samples to
  crash when using the Label Studio backend
  `#2145 <https://github.com/voxel51/fiftyone/pull/2145>`_

Zoo

- Added support for using CUDA devices when running the
  :ref:`CLIP model <model-zoo-clip-vit-base32-torch>` from the zoo
  `#2201 <https://github.com/voxel51/fiftyone/pull/2201>`_

.. _release-notes-v0.17.2:

FiftyOne 0.17.2
---------------
*Released September 20, 2022*

App

- Fixed a backward compatability bug when connecting to older database verions
  `#2103 <https://github.com/voxel51/fiftyone/pull/2103>`_

.. _release-notes-v0.17.1:

FiftyOne 0.17.1
---------------
*Released September 20, 2022*

Core

- Removed `TypedDict` usage introduced in v0.17.0 that is not supported in
  Python 3.7 `#2100 <https://github.com/voxel51/fiftyone/pull/2100>`_

.. _release-notes-v0.17.0:

FiftyOne 0.17.0
---------------
*Released September 19, 2022*

App

- Added support for :ref:`visualizing grouped datasets <groups-app>` in the
  App `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added support for :ref:`visualizing point cloud samples <app-3d-visualizer>`
  in the modal `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added support for visualizing and interacting with |GeoLocation| data in a
  new :ref:`Map panel <app-map-panel>`
  `#1976 <https://github.com/voxel51/fiftyone/pull/1976>`_
- Added initial support for :ref:`custom App plugins <fiftyone-plugins>`
  `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added support for configuring
  :ref:`multiple media fields <app-multiple-media-fields>`
  `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Fixed Google Colab screenshotting and cell updates
  `#2069 <https://github.com/voxel51/fiftyone/pull/2069>`_

Core

- Added support for :ref:`grouped datasets <groups>`, e.g., multiple camera
  view scenes `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added support for :ref:`point cloud samples <groups-point-clouds>` in grouped
  datasets `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added an :attr:`app_config <fiftyone.core.dataset.Dataset.app_config>`
  property to datasets for :ref:`configuring App behavior <dataset-app-config>`
  on a per-dataset basis
  `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added an optional `rel_dir` parameter to
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
  and
  :meth:`draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
  `#2060 <https://github.com/voxel51/fiftyone/pull/2060>`_
- Added an optional `abs_paths=True` option to
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
  `#2060 <https://github.com/voxel51/fiftyone/pull/2060>`_
- Added an optional ``use_dirs=True`` parameter to
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
  that causes metadata to be exported in per-sample/frame JSON files
  `#2028 <https://github.com/voxel51/fiftyone/pull/2028>`_
- Updated the :ref:`COCO importer <COCODetectionDataset-import>` to load all
  available label types by default
  `#1869 <https://github.com/voxel51/fiftyone/pull/1869>`_
- Fixed a bug when passing `ordered=True` to
  :meth:`select_by() <fiftyone.core.collections.SampleCollection.select_by>`
  `#2059 <https://github.com/voxel51/fiftyone/pull/2059>`_
- Fixed an error that would occur when storing
  :ref:`custom embedded documents <custom-embedded-documents>` on dynamic
  label attributes `#2051 <https://github.com/voxel51/fiftyone/pull/2051>`_
- Fixed a
  :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
  bug that caused all frames to be included, even if the view filters the
  frames `#2029 <https://github.com/voxel51/fiftyone/pull/2029>`_

Docs

- Added a :doc:`tutorial </tutorials/detectron2>` showing how to integrate
  FiftyOne into a Detectron2 model training pipeline
  `#2054 <https://github.com/voxel51/fiftyone/pull/2054>`_

Annotation

- Fixed a bug that occured when checking if tasks exist on CVAT v2 servers
  `#2070 <https://github.com/voxel51/fiftyone/pull/2070>`_
- Fixed an error that occured when deseriailizing Label Studio annotation
  results `#2074 <https://github.com/voxel51/fiftyone/pull/2074>`_

Zoo

- Added :ref:`clip-vit-base32-torch <model-zoo-clip-vit-base32-torch>` to the
  model zoo! `#2072 <https://github.com/voxel51/fiftyone/pull/2072>`_
- Added the :ref:`Quickstart Groups dataset <dataset-zoo-quickstart-groups>`
  to the dataset zoo! `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_
- Added the :ref:`KITTI Multiview dataset <dataset-zoo-kitti-multiview>` to the
  dataset zoo! `#1765 <https://github.com/voxel51/fiftyone/pull/1765>`_

.. _release-notes-v0.16.6:

FiftyOne 0.16.6
---------------
*Released August 25, 2022*

App

- Fixed a bug that caused the App to break when sample tags contained `.`
  `#1924 <https://github.com/voxel51/fiftyone/pull/1924>`_
- Fixed search results alignment
  `#1930 <https://github.com/voxel51/fiftyone/pull/1930>`_
- Fixed App refreshes after view changes had occurred from the view bar
  `#1931 <https://github.com/voxel51/fiftyone/pull/1931>`_
- Fixed mask targets rendering in the tooltip
  `#1943 <https://github.com/voxel51/fiftyone/pull/1943>`_
  `#1949 <https://github.com/voxel51/fiftyone/pull/1949>`_
- Fixed classification confusion matrix connections
  `#1967 <https://github.com/voxel51/fiftyone/pull/1967>`_

Core

- Added a save context that enables
  :ref:`efficient batch edits <efficient-batch-edits>` of datasets and views
  `#1727 <https://github.com/voxel51/fiftyone/pull/1727>`_
- Added Plotly v5 support
  `#1981 <https://github.com/voxel51/fiftyone/pull/1981>`_
- Added a :ref:`quantiles aggregation <aggregations-quantiles>`
  `#1937 <https://github.com/voxel51/fiftyone/pull/1937>`_
- Added support for writing transformed images/videos to new locations in the
  :func:`transform_images() <fiftyone.utils.image.transform_images>` and
  :func:`transform_videos() <fiftyone.utils.video.transform_videos>` functions
  `#2007 <https://github.com/voxel51/fiftyone/pull/2007>`_
- Added support for configuring the
  :ref:`package-wide logging level <configuring-fiftyone>`
  `#2009 <https://github.com/voxel51/fiftyone/pull/2009>`_
- Added more full-featured support for serializing and deserializing datasets,
  views, and samples via `to_dict()` and `from_dict()`
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Added support for dynamic attributes when performing coerced exports
  `#1993 <https://github.com/voxel51/fiftyone/pull/1993>`_
- Introduced the notion of client compatability versions
  `#2017 <https://github.com/voxel51/fiftyone/pull/2017>`_
- Extended :meth:`stats() <fiftyone.core.collections.SampleCollection>` to all
  sample collections `#1940 <https://github.com/voxel51/fiftyone/pull/1940>`_
- Added support for serializing aggregations
  `#1911 <https://github.com/voxel51/fiftyone/pull/1911>`_
- Added :func:`weighted_sample() <fiftyone.utils.random.weighted_sample>`
  and :func:`balanced_sample() <fiftyone.utils.random.balanced_sample>`
  utility methods `#1925 <https://github.com/voxel51/fiftyone/pull/1925>`_
- Added an optional ``new_ids=True`` option to
  :meth:`Dataset.add_collection() <fiftyone.core.dataset.Dataset.add_collection>`
  that generates new sample/frame IDs when adding the samples
  `#1927 <https://github.com/voxel51/fiftyone/pull/1927>`_
- Added support for the `path` variable in `dataset.yaml` of
  :ref:`YOLOv5 datasets <YOLOv5Dataset-import>`
  `#1903 <https://github.com/voxel51/fiftyone/issues/1903>`_
- Fixed a bug that prevented using 
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  to set frame-level label fields
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed automatic declaration of frame fields when computing embeddings on a
  frame view `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed a regression that caused label ID fields to be returned as
  `ObjectID` `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed a bug that allowed default frame fields to be excluded
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- :class:`ClipsView <fiftyone.core.clips.ClipsView>` instances will now report
  their `metadata` type as |VideoMetadata|
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed
  :meth:`load_evaluation_view() <fiftyone.core.dataset.Dataset.load_evaluation_view>`
  when ``select_fields`` is ``True``
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed boolean field parsing when declaring fields
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed a bug that caused nested embedded documents to corrupt datasets
  `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_
- Fixed a bug that prevented assignment of array-valued dynamic attributes
  to labels `#1922 <https://github.com/voxel51/fiftyone/pull/1922>`_

Annotation

- Added a new :ref:`Label Studio integration! <label-studio-integration>`
  `#1848 <https://github.com/voxel51/fiftyone/pull/1848>`_
- Optimized loading CVAT annotations and performing operations on
  :class:`CVATAnnotationResults <fiftyone.utils.cvat.CVATAnnotationResults>`
  `#1944 <https://github.com/voxel51/fiftyone/pull/1944>`_
- Upgraded the :class:`AnnotationAPI <fiftyone.utils.annotations.AnnotationAPI>`
  interface `#1997 <https://github.com/voxel51/fiftyone/pull/1997>`_
- Fixed loading group IDs in CVAT video tasks
  `#1917 <https://github.com/voxel51/fiftyone/pull/1917>`_
- Fixed uploading to a CVAT project when no label schema is provided
  `#1926 <https://github.com/voxel51/fiftyone/pull/1926>`_

.. _release-notes-v0.16.5:

FiftyOne 0.16.5
---------------
*Released June 24, 2022*

App

- Fixed dataset selection searches
  `#1907 <https://github.com/voxel51/fiftyone/pull/1907>`_
- Fixed dataset results for long dataset names
  `#1907 <https://github.com/voxel51/fiftyone/pull/1907>`_

.. _release-notes-v0.16.4:

FiftyOne 0.16.4
---------------
*Released June 21, 2022*

App

- Fixed frame fields omission in the sidebar
  `#1899 <https://github.com/voxel51/fiftyone/pull/1899>`_

.. _release-notes-v0.16.3:

FiftyOne 0.16.3
---------------
*Released June 20, 2022*

App

- Added hotkey to hide overlays while pressed
  `#1779 <https://github.com/voxel51/fiftyone/pull/1779>`_
- Changed expanded view ESC sequence to reset zoom before frame scrubbing
  `#1810 <https://github.com/voxel51/fiftyone/pull/1810>`_
- Fixed the expanded view tooltip when a keypoint has ``nan`` point(s)
  `#1828 <https://github.com/voxel51/fiftyone/pull/1828>`_
- Fixed initial loading of keypoint skeletons 
  `#1828 <https://github.com/voxel51/fiftyone/pull/1828>`_
- Fixed |Classifications| rendering in the grid 
  `#1828 <https://github.com/voxel51/fiftyone/pull/1828>`_
- Fixed App loads for environments with old (``<=v0.14.0``) datasets that have
  yet to be migrated `#1829 <https://github.com/voxel51/fiftyone/pull/1829>`_
- Fixed spurious loading states from tagging in the expanded view
  `#1834 <https://github.com/voxel51/fiftyone/pull/1834>`_
- Fixed a bug that caused frame classifications to be incorrectly rendered in
  the grid `#1877 <https://github.com/voxel51/fiftyone/pull/1877>`_
- Fixed active (checked) field persistence in the grid when changing views
  `#1878 <https://github.com/voxel51/fiftyone/pull/1878>`_
- Fixed views and actions that contain ``BSON``
  `#1879 <https://github.com/voxel51/fiftyone/pull/1879>`_
- Fixed ``JSON`` rendering in the expanded view for nested data
  `#1880 <https://github.com/voxel51/fiftyone/pull/1880>`_
- Fixed selection and expansion for bad media files
  `#1882 <https://github.com/voxel51/fiftyone/pull/1882>`_
- Fixed ``Other`` plot tab ``date`` and ``datetime`` fields with ``None``
  values `#1817 <https://github.com/voxel51/fiftyone/pull/1817>`_
- Increased results from 10 to 200 for search selectors
  `#1875 <https://github.com/voxel51/fiftyone/pull/1875>`_
- Fixed App issues related to dataset deletion and dataset schema changes
  `#1875 <https://github.com/voxel51/fiftyone/pull/1875>`_

Core

- Added ``skeleton`` and ``skeleton_key`` to the OpenLABEL
  :ref:`image <OpenLABELImageDataset-import>` and
  :ref:`video <OpenLABELVideoDataset-import>` importers
  `#1812 <https://github.com/voxel51/fiftyone/pull/1812>`_
- Fixed a database field issue in
  :meth:`clone_frame_field() <fiftyone.core.dataset.Dataset.clone_frame_field>`
  and
  :meth:`clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`,
  `#1824 <https://github.com/voxel51/fiftyone/pull/1824>`_
- Fixed using zoo models with the newest version of Torchvision
  `#1838 <https://github.com/voxel51/fiftyone/pull/1838>`_
- Added
  :func:`classifications_to_detections() <fiftyone.utils.labels.classifications_to_detections>`
  for converting classifications to detections
  `#1842 <https://github.com/voxel51/fiftyone/pull/1842>`_
- Set forking as the default for macOS multiprocessing
  `#1844 <https://github.com/voxel51/fiftyone/pull/1844>`_
- Added :attr:`dataset.tags <fiftyone.core.dataset.Dataset.tags>`
  for organizing datasets
  `#1845 <https://github.com/voxel51/fiftyone/pull/1845>`_
- Added functionality to explicitly define classes for evaluation methods
  `#1858 <https://github.com/voxel51/fiftyone/pull/1858>`_
- Fixed ``tfrecord`` shard enumeration, i.e. zero indexing
  `#1859 <https://github.com/voxel51/fiftyone/pull/1859>`_
- Added support for label field dicts when importing labeled datasets
  `#1864 <https://github.com/voxel51/fiftyone/pull/1864>`_
- Removed non-XML or non-TXT files from CVAT, KITTI, CVATVideo
  `#1884 <https://github.com/voxel51/fiftyone/pull/1884>`_

Annotation

- Updated CVAT task and project processing
  `#1839 <https://github.com/voxel51/fiftyone/pull/1839>`_
- Added the ability to upload and download group ids from CVAT
  `#1876 <https://github.com/voxel51/fiftyone/pull/1876>`_

.. _release-notes-v0.16.2:

FiftyOne 0.16.2
---------------
*Released June 2, 2022*

App

- Added explicit error handling when ``FFmpeg`` is installed so it is made
  clear to the user that it must be installed to use video datasets in the App
  `#1801 <https://github.com/voxel51/fiftyone/pull/1801>`_
- Fixed range requests for media files, e.g. mp4s, on the server
  `#1786 <https://github.com/voxel51/fiftyone/pull/1786>`_
- Fixed tag rendering in the grid
  `#1808 <https://github.com/voxel51/fiftyone/pull/1808>`_
- Fixed tagging selected labels in the expanded view
  `#1808 <https://github.com/voxel51/fiftyone/pull/1808>`_
- Fixed ``session.view = None``
  `#1808 <https://github.com/voxel51/fiftyone/pull/1808>`_
- Fixed issues with patches views
  `#1808 <https://github.com/voxel51/fiftyone/pull/1808>`_

Core

- Fixed errors related to session-attached plots
  `#1808 <https://github.com/voxel51/fiftyone/pull/1808>`_

.. _release-notes-v0.16.1:

FiftyOne 0.16.1
---------------
*Released May 26, 2022*

App

- Fixed a bug that caused label rendering to be delayed until statistics
  were loaded `#1776 <https://github.com/voxel51/fiftyone/pull/1776>`_
- Fixed the ``v0.16.0`` migration that prevents label lists, e.g. |Detections|
  from showing their label filters when expanded in the sidebar
  `#1785 <https://github.com/voxel51/fiftyone/pull/1785>`_
- Fixed expanded samples in clips views which appeared to be empty
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_
- Fixed "Sort by similarity" with a `dist_field`
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_
- Fixed "Color by" for simple values (classifications, tags, etc.)
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_
- Fixed changing datasets when sort by similarity is set
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_
- Fixed mask and map coloring
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_
- Fixed fortran array handling for masks and maps 
  `#1790 <https://github.com/voxel51/fiftyone/pull/1790>`_

Core

- Fixed a formatting issue when raising an exception because unsupported
  plotting backend was requested 
  `#1794 <https://github.com/voxel51/fiftyone/pull/1794>`_

.. _release-notes-v0.16.0:

FiftyOne 0.16.0
---------------
*Released May 24, 2022*

App

- Added routing, e.g. `/datasets/:dataset-name`
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Redesigned the sidebar to support custom grouping and sorting of fields and
  tags `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Added graceful handling of deleted datasets in the App
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Fixed epoch rendering
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Fixed empty heatmap rendering
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Added stack traces to the new error page
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Fixed ``ESC`` when viewing single frame clips
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Fixed handling of unsupported videos
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Added support for opening the expanded view while sample(s) are selected
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_
- Fixed keypoint skeleton rendering for named skeletons of frame fields
  `#1713 <https://github.com/voxel51/fiftyone/pull/1713>`_

Core

- Fixed edge cases in
  :meth:`clone_frame_field() <fiftyone.core.dataset.Dataset.clone_frame_field>`,
  :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`,
  and
  :meth:`rename_frame_field() <fiftyone.core.dataset.Dataset.rename_frame_field>`
  `#1749 <https://github.com/voxel51/fiftyone/pull/1749>`_
- Fixed a bug that would cause non-persistent datasets to be prematurely
  deleted `#1747 <https://github.com/voxel51/fiftyone/pull/1747>`_
- Fixed loading relative paths in :ref:`YOLOv5 <YOLOv5Dataset-import>` format
  `#1721 <https://github.com/voxel51/fiftyone/pull/1721>`_
- Fixed image lists for the `image_path` parameter when importing
  :ref:`GeoTIFF datasets <GeoTIFFDataset-import>`
  `#1728 <https://github.com/voxel51/fiftyone/pull/1728>`_
- Added a :func:`find_duplicates() <fiftyone.utils.iou.find_duplicates>`
  utility to automatically find duplicate objects based on IoU
  `#1714 <https://github.com/voxel51/fiftyone/pull/1714>`_

.. _release-notes-v0.15.1:

FiftyOne 0.15.1
---------------
*Released April 26, 2022*

App

- Added support for rendering keypoint skeletons
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added support for rendering per-point confidences and other custom per-point
  attributes on |Keypoint| objects
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added support for rendering Fortan-ordered arrays
  `#1660 <https://github.com/voxel51/fiftyone/pull/1660>`_

Core

- Added support for
  :ref:`storing keypoint skeletons <storing-keypoint-skeletons>` on datasets
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added a
  :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`
  stage that applies per-`point` filters to |Keypoint| objects
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added support for rendering keypoints skeletons and missing keypoints to
  :meth:`draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added support for per-point confidences and other custom per-point attributes
  on |Keypoint| objects. See :ref:`this section <keypoints>` for details
  `#1601 <https://github.com/voxel51/fiftyone/pull/1601>`_
- Added a :meth:`concat() <fiftyone.core.collections.SampleCollection.concat>`
  view stage that allows for concatenating one collection onto another
  `#1662 <https://github.com/voxel51/fiftyone/pull/1662>`_
- Non-persistent datasets are now automatically deleted when using a custom
  `database_uri` `#1697 <https://github.com/voxel51/fiftyone/pull/1697>`_
- Added a `database_admin` config setting that can control whether database
  migrations are allowed. See :ref:`this page <database-migrations>` for
  details `#1692 <https://github.com/voxel51/fiftyone/pull/1692>`_
- Added a `database_name` config setting that allows for customizing the
  MongoDB database name `#1692 <https://github.com/voxel51/fiftyone/pull/1692>`_
- |Classification| attributes are now exported as tag attributes when exporting
  in :ref:`CVATImageDataset format <CVATImageDataset-export>`
  `#1686 <https://github.com/voxel51/fiftyone/pull/1686>`_
- The `iscrowd` attribute is now always populated when exporting in
  :ref:`COCO format <COCODetectionDataset-export>`
  `#1664 <https://github.com/voxel51/fiftyone/pull/1664>`_
- Fixed a `KeyError` bug when loading dataset with relative paths on Windows
  `#1675 <https://github.com/voxel51/fiftyone/pull/1675>`_

Brain

- Added `fiftyone-brain` wheels for Python 3.10
- Added support for installing `fiftyone-brain` on Apple Silicon

Annotation

- Fixed a `CSRF Failed` error when connecting to some CVAT servers
  `#1668 <https://github.com/voxel51/fiftyone/pull/1668>`_

Integrations

- Updated the :ref:`Lightning Flash integration <lightning-flash>` to support
  Flash versions 0.7.0 or later
  `#1671 <https://github.com/voxel51/fiftyone/pull/1671>`_

Zoo

- Added the :ref:`Families in the Wild dataset <dataset-zoo-fiw>` to the
  FiftyOne Dataset Zoo!
  `#1663 <https://github.com/voxel51/fiftyone/pull/1663>`_

.. _release-notes-v0.15.0:

FiftyOne 0.15.0
---------------
*Released March 23, 2022*

App

- Fixed :class:`Regression <fiftyone.core.labels.Regression>` rendering in the
  visualizer `#1604 <https://github.com/voxel51/fiftyone/pull/1604>`_

Core

- Added a :meth:`Dataset.delete_frames() <fiftyone.core.dataset.Dataset.delete_frames>`
  method that allows for deleting frames by ID
  `#1650 <https://github.com/voxel51/fiftyone/pull/1650>`_
- Added a :meth:`keep_fields() <fiftyone.core.view.DatasetView.keep_fields>`
  method to |DatasetView| and its subclasses
  `#1616 <https://github.com/voxel51/fiftyone/pull/1616>`_
- Added a :func:`lines() <fiftyone.core.plots.base.lines>` method that allows
  for plotting lines whose scatter points can be interactively selected via the
  typical `interactive plotting workflows <https://voxel51.com/docs/fiftyone/user_guide/plots.html>`_
  `#1614 <https://github.com/voxel51/fiftyone/pull/1614>`_
- Added an optional `force_rgb=True` syntax when importing/exporting/creating
  TF records using all relevant methods in :mod:`fiftyone.utils.tf`
  `#1612 <https://github.com/voxel51/fiftyone/pull/1612>`_
- Added support for passing additional kwargs to the `fiftyone convert` CLI
  command
  `#1612 <https://github.com/voxel51/fiftyone/pull/1612>`_
- Added support for annotating video-level labels when using
  :func:`draw_labeled_videos() <fiftyone.utils.annotations.draw_labeled_videos>`
  `#1619 <https://github.com/voxel51/fiftyone/pull/1619>`_
- Added the ability to slice using a |ViewField|
  `#1630 <https://github.com/voxel51/fiftyone/pull/1630>`_
- Fixed bug in :func:`from_images_dir() <fiftyone.utils.tf.from_images_dir>`
  where attempting to load 4-channel images errored even if `force_rgb=True`
  `#1632 <https://github.com/voxel51/fiftyone/pull/1632>`_
- Fixed a bug that prevented frames from being attached to video collections
  when aggregating expressions that involve both |Sample|-level and
  |Frame|-level fields
  `#1644 <https://github.com/voxel51/fiftyone/pull/1644>`_
- Added support for importing :ref:`image <OpenLABELImageDataset-import>` and
  :ref:`video <OpenLABELVideoDataset-import>` datasets in
  `OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f#_introduction>`_
  `#1609 <https://github.com/voxel51/fiftyone/pull/1609>`_

Annotation

- Added support for CVATv2 servers when using the CVAT backend
  `#1638 <https://github.com/voxel51/fiftyone/pull/1638>`_
- Added an `issue_tracker` argument to
  :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
  when using the CVAT backend
  `#1625 <https://github.com/voxel51/fiftyone/pull/1625>`_
- Added a `dest_field` argument to
  :func:`load_annotations() <fiftyone.utils.annotations.load_annotations>`
  which allows you to specify the name of the field to which to load annotations
  `#1642 <https://github.com/voxel51/fiftyone/pull/1642>`_
- Added a property to annotation backends that decides whether to allow
  annotation of video-level labels
  `#1655 <https://github.com/voxel51/fiftyone/pull/1655>`_
- Fixed a bug where views that dynamically modify label strings would result in
  labels not being uploaded to the annotation backend
  `#1647 <https://github.com/voxel51/fiftyone/pull/1647>`_

Docs

- Added :ref:`documentation <custom-embedded-documents>` for defining custom
  |EmbeddedDocument| and |DynamicEmbeddedDocument| classes
  `#1617 <https://github.com/voxel51/fiftyone/pull/1617>`_
- Added :ref:`documentation <view-slicing>` about boolean view indexing to the
  user guide `#1617 <https://github.com/voxel51/fiftyone/pull/1617>`_
- Added a :doc:`recipe </recipes/creating_views>` for creating views and view
  expressions `#1641 <https://github.com/voxel51/fiftyone/pull/1641>`_

.. _release-notes-v0.14.4:

FiftyOne 0.14.4
---------------
*Released February 7, 2022*

News

- With support from the `ActivityNet team <http://activity-net.org/download.html>`_,
  FiftyOne is now a recommended tool for downloading, visualizing, and
  evaluating on the Activitynet dataset! Check out
  :ref:`this guide <activitynet>` for more details

App

- Fixed encoding of sample media URLs so image and video filepaths with special
  characters are supported
- Fixed an error that would occur when rendering empty |Keypoint| instances

Core

- Added an official
  `Dockerfile <https://github.com/voxel51/fiftyone/blob/develop/Dockerfile>`_
- Changed the default implementation of
  :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>` to
  assume that the user has already sampled the frames offline and stored their
  locations in a `filepath` field of each |Frame| in their video dataset. See
  :ref:`this section <frame-views>` for more details
- Updated :meth:`DatasetView.save() <fiftyone.core.view.DatasetView.save>` to
  save changes to (only) the samples in the view to the underlying dataset
- Added a new :meth:`DatasetView.keep() <fiftyone.core.view.DatasetView.keep>`
  method that deletes any samples that are not in the view from the underlying
  dataset
- Added
  :meth:`InteractivePlot.save() <fiftyone.core.plots.base.InteractivePlot.save>`
  and
  :meth:`ViewPlot.save() <fiftyone.core.plots.base.ViewPlot>` methods that can
  be used to save plots as static images
- Added support for populating query distances on a dataset when using
  :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
  to query by similarity
- Added a
  :func:`instances_to_polylines() <fiftyone.utils.labels.instances_to_polylines>`
  utility that converts instance segmentations to |Polylines| format
- Added support for frame labels to all conversion methods in the
  :mod:`fiftyone.utils.labels` module
- Updated the implementation of
  :meth:`Detection.to_polyline() <fiftyone.core.labels.Detection.to_polyline>`
  so that all attributes are included rather than just ETA-supported ones
- Added support for including empty labels labels via an `include_missing`
  keyword argument in
  :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>`
- Added a
  :func:`download_youtube_videos() <fiftyone.utils.youtube.download_youtube_videos>`
  utility for efficiently and robustly downloading videos or specific segments
  from YouTube
- Added a `skip_failures` flag to
  :func:`transform_images() <fiftyone.utils.image.transform_images>` and
  :func:`transform_videos() <fiftyone.utils.video.transform_videos>`
- Added `shuffle` and `seed` parameters to
  :class:`FiftyOneImageLabelsDatasetImporter <fiftyone.utils.data.importers.FiftyOneImageLabelsDatasetImporter>`
  and
  :class:`FiftyOneVideoLabelsDatasetImporter <fiftyone.utils.data.importers.FiftyOneVideoLabelsDatasetImporter>`
- Added an `include_all_data` parameter to
  :class:`YOLOv5DatasetImporter <fiftyone.utils.yolo.YOLOv5DatasetImporter>`
- Resolved a bug that would previously cause an error when writing aggregations
  on video datasets that involve applying expressions directly to `"frames"`

Annotation

- Added support for :ref:`importing <CVATImageDataset-import>` and
  :ref:`exporting <CVATImageDataset-export>` sample-level tags in CVAT format
- Fixed a bug that prevented existing label fields such as |Detections| that
  can contain multiple annotation types (boxes or instances) from being
  specified in calls to
  :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
- CVAT login credentials are no longer included in exception messages

Zoo

- Added :ref:`ActivityNet 100 <dataset-zoo-activitynet-100>` to the dataset
  zoo!
- Added :ref:`ActivityNet 200 <dataset-zoo-activitynet-200>` to the dataset
  zoo!
- Added :ref:`Kinetics 400 <dataset-zoo-kinetics-400>` to the dataset zoo!
- Added :ref:`Kinetics 600 <dataset-zoo-kinetics-600>` to the dataset zoo!
- Added :ref:`Kinetics 700 <dataset-zoo-kinetics-700>` to the dataset zoo!
- Added :ref:`Kinetics 700-2020 <dataset-zoo-kinetics-700-2020>` to the dataset
  zoo!

.. _release-notes-v0.14.3:

FiftyOne 0.14.3
---------------
*Released January 13, 2022*

Core

- Added hollow support for 32-bit systems (a
  :ref:`database_uri <configuring-mongodb-connection>` must be used in such
  cases)
- Added support for indexing into datasets using boolean arrays or view
  expressions via new `dataset[bool_array]` and `dataset[bool_expr]` syntaxes
- Added support for registering custom |EmbeddedDocument| classes that can be
  used to populate fields and embedded fields of datasets
- Added support for importing and exporting `confidence` in YOLO formats
- Added support for directly passing a `filename -> filepath` mapping dict to
  the `data_path` parameter to
  :ref:`dataset importers <loading-datasets-from-disk>`
- Added graceful casting of `int`-like and `float`-like values like
  `np.float(1.0)` to their respective Python primitives for storage in the
  database
- Changed the default to `num_workers=0` when using methods like
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
  to apply Torch models on Windows, which avoids multiprocessing issues
- Fixed a bug when calling
  :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
  with both the `classes` and `compute_mAP=True` arguments provided
- Fixed a bug that could arise when importing segmentation data from a COCO
  JSON that contains objects with `[]` segmentation data
- Fixed a bug in expressions containing near-epoch dates
- Added support for setting frame-level fields by passing frame number dicts to
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
- Fixes a bug that prevented
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
  from working as expected when `key_field="id"` argument is used
- Fixed a bug that occurred when computing patch embeddings defined by
  :ref:`polylines <polylines>`
- Added decision thresholds to the tooltips of PR/ROC curves plotted via the following methods:
    - :meth:`BinaryClassificationResults.plot_pr_curve() <fiftyone.utils.eval.classification.BinaryClassificationResults.plot_pr_curve>`
    - :meth:`BinaryClassificationResults.plot_roc_curve() <fiftyone.utils.eval.classification.BinaryClassificationResults.plot_roc_curve>`
    - :meth:`COCODetectionResults.plot_pr_curves() <fiftyone.utils.eval.coco.COCODetectionResults.plot_pr_curves>`
    - :meth:`OpenImagesDetectionResults.plot_pr_curves() <fiftyone.utils.eval.openimages.OpenImagesDetectionResults.plot_pr_curves>`

Brain

- Graceful handling of missing/uncomputable embeddings in
  :func:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`
- Graceful handling of edge cases like `fraction <= 0` in
  :meth:`find_duplicates() <fiftyone.brain.similarity.DuplicatesMixin.find_duplicates>`,
- Removed a spurious warning message that was previously logged when computing
  patch embeddings for a collection containing samples with no patches

Annotation

- Added a new :ref:`Labelbox integration <labelbox-integration>`!
- Added an :func:`import_annotations() <fiftyone.utils.cvat.import_annotations>`
  method for importing existing CVAT projects or task(s) into FiftyOne
- Added support for :ref:`configuring the size of CVAT tasks <cvat-large-runs>`
  via a new `task_size` parameter
- Added graceful handling of deleted tasks when importing annotations from CVAT
  via
  :meth:`load_annotations() <fiftyone.core.dataset.Dataset.load_annotations>`
- Added an `unexpected` parameter that provides
  :ref:`a variety of options <cvat-unexpected-annotations>` for handling
  unexpected annotations returned by the CVAT API
- Added support for passing request headers to the CVAT API
- Fixed a bug that occured when importing single frame track segments from CVAT

Zoo

- Fixed a regression in `fiftyone==0.14.1` that prevented
  :ref:`zoo datasets <dataset-zoo>` that use the Torch backend from being
  downloaded
- Added the following TF2 models to the Model Zoo!
    - :ref:`centernet-hg104-1024-coco-tf2 <model-zoo-centernet-hg104-1024-coco-tf2>`
    - :ref:`centernet-resnet101-v1-fpn-512-coco-tf2 <model-zoo-centernet-resnet101-v1-fpn-512-coco-tf2>`
    - :ref:`centernet-resnet50-v2-512-coco-tf2 <model-zoo-centernet-resnet50-v2-512-coco-tf2>`
    - :ref:`centernet-mobilenet-v2-fpn-512-coco-tf2 <model-zoo-centernet-mobilenet-v2-fpn-512-coco-tf2>`
    - :ref:`efficientdet-d0-512-coco-tf2 <model-zoo-efficientdet-d0-512-coco-tf2>`
    - :ref:`efficientdet-d1-640-coco-tf2 <model-zoo-efficientdet-d1-640-coco-tf2>`
    - :ref:`efficientdet-d2-768-coco-tf2 <model-zoo-efficientdet-d2-768-coco-tf2>`
    - :ref:`efficientdet-d3-896-coco-tf2 <model-zoo-efficientdet-d3-896-coco-tf2>`
    - :ref:`efficientdet-d4-1024-coco-tf2 <model-zoo-efficientdet-d4-1024-coco-tf2>`
    - :ref:`efficientdet-d5-1280-coco-tf2 <model-zoo-efficientdet-d5-1280-coco-tf2>`
    - :ref:`efficientdet-d6-1280-coco-tf2 <model-zoo-efficientdet-d6-1280-coco-tf2>`
    - :ref:`efficientdet-d7-1536-coco-tf2 <model-zoo-efficientdet-d7-1536-coco-tf2>`
    - :ref:`ssd-mobilenet-v2-320-coco17 <model-zoo-ssd-mobilenet-v2-320-coco17>`
    - :ref:`ssd-mobilenet-v1-fpn-640-coco17 <model-zoo-ssd-mobilenet-v1-fpn-640-coco17>`

.. _release-notes-v0.14.2:

FiftyOne 0.14.2
---------------
*Released November 24, 2021*

App

- Improved mask loading times for |Segmentation|, |Heatmap|, and |Detection|
  labels with instance masks

Core

- Optimized image metadata calculation to read only the bare minimum byte
  content of each image
- Improved handling of relative paths and user paths in config settings and
  environment variables
- Optimized database I/O and improved the helpfulness of warnings/errors that
  are generated when applying models via
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
  :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
  and
  :meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
- Resolved a `memory leak <https://github.com/voxel51/fiftyone/issues/1442>`_
  that could occur when computing predictions/embeddings for very large
  datasets with Torch models

Brain

- Added the `points` keyword argument to
  :func:`compute_visualization() <fiftyone.brain.compute_visualization>` for
  providing your own manually computed low-dimensional representation for use
  with interactive embeddings plots
- Graceful handling of missing/uncomputable embeddings in
  :func:`compute_visualization() <fiftyone.brain.compute_visualization>` and
  :func:`compute_similarity() <fiftyone.brain.compute_similarity>`
- Added checks that occur at the start of all methods to ensure that any
  required dependencies are installed prior to performing any expensive
  computations

Annotation

- Changed CVAT uploads to retain original filenames
- A helpful error is now raised when the `"frames."` prefix is omitted from
  label fields when requesting spatial annotations on video datasets

Zoo

- Patched an issue that prevented downloading the
  :ref:`VOC-2007 <dataset-zoo-voc-2007>` and
  :ref:`VOC-2012 <dataset-zoo-voc-2012>` datasets from the zoo

.. _release-notes-v0.14.1:

FiftyOne 0.14.1
---------------
*Released November 15, 2021*

App

- Optimized grid loading for collections that do not have metadata computed
- Fixed filtering by label for Colab notebooks
- Fixed a bug where the App would crash if an image or video MIME type could not
  be inferred from the filepath, e.g. without an extension
- Fixed first pixel coloring for segmentations
- Added graceful handling of nonfinites (`-inf`, `inf`, and `nan`)

Core

- Fixed :meth:`clone() <fiftyone.core.view.DatasetView>` for views with a
  parent dataset that has brain runs
- Fixed sampling frames when using
  :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`
- Fixed importing of :class:`FiftyOneDataset <fiftyone.types.FiftyOneDataset>`
  with run results
- Added a :class:`Regression <fiftyone.core.labels.Regression>` label type
- Added a :func:`random_split() <fiftyone.utils.random.random_split>` method
- Added support for negating
  :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels()>`
  queries
- Added a :class:`MaxResize <fiftyone.utils.torch.MaxResize>` transform
- Added `image_max_size` and `image_max_dim` parameters to
  :class:`TorchImageModelConfig <fiftyone.utils.torch.TorchImageModelConfig>`
- Added support for non-sequential updates in
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
- Added a
  :meth:`compute_max_ious() <fiftyone.utils.eval.detection.compute_max_ious>`
  utility
- Added support for labels-only exports when working with
  :class:`YOLOv4Dataset <fiftyone.types.YOLOv4Dataset>` and
  :class:`YOLOv5Dataset <fiftyone.types.YOLOv5Dataset>` formats
- Added :mod:`fiftyone.utils.beam` for parallel import, merge, and export
  operations with `Apache Beam <https://beam.apache.org>`_
- Added an  :func:`add_yolo_labels() <fiftyone.utils.yolo.add_yolo_labels>`
  utility that provides support for adding YOLO-formatted model predictions to
  an existing dataset
- Added support for importing/exporting multilabel classifications when using
  :ref:`FiftyOneImageClassificationDataset format <FiftyOneImageClassificationDataset-import>`
- Fixed the `force_reencode` flag for
  :func:`reencode_videos() <fiftyone.utils.video.reencode_videos>`
- Converted COCO and Open Images dataset downloads to use multithreading
  rather than multiprocessing
- Updated evalution confusion matrices to always include rows and columns for
  missing/other

Annotation

- Added support for annotating multiple label fields in one CVAT task
- Added an `allow_index_edits` parameter to
  :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
  for disallowing video track index changes
- Improved label ID tracking in CVAT by leveraging CVAT's server IDs in
  addition to `label_id` attributes
- Fixed a bug when annotating videos in CVAT with `None` label fields
- Fixed a bug when annotating new fields in CVAT
- Fixed a bug when annotating non-continuous tracks in CVAT
- Fixed a bug when annotating a track in CVAT that is present on the last frame
  of a video
- Fixed a bug when annotating with `allow_additions=False`

Docs

- Added a section on :ref:`adding model predictions <model-predictions>` to
  existing datasets to the user guide
- Added explicit examples of labels-only
  :ref:`imports <loading-datasets-from-disk>` and
  :ref:`exports <exporting-datasets>` for all relevant datasets to the docs
- Documented how class lists are computed when exporting in formats like YOLO
  and COCO that require explicit class lists
- Documented the supported label types for all exporters

.. _release-notes-v0.14.0:

FiftyOne 0.14.0
---------------
*Released October 15, 2021*

App

- Added support for visualizing :ref:`heatmaps <heatmaps>` using either
  transparency or a customizable colorscale
- Added a label opacity slider in both the sample grid and the expanded sample
  view
- Added support for visualizing :ref:`clips views <app-video-clips>`
- Added support for rendering and filtering |DateField| and |DateTimeField|
  data
- Improved error handling in the grid and when streaming frames
- Fixed a bug that caused incorrect label rendering for sparse frame labels
  in the video visualizer
- Added a `default_app_address` setting to the FiftyOne config for restricting
  sessions to a hostname. See :ref:`this page <restricting-app-address>` for
  more details

Core

- Added a :ref:`Heatmap label type <heatmaps>`
- Added support for adding
  :ref:`date and datetime fields <dates-and-datetimes>` to FiftyOne datasets
- Added the
  :meth:`to_clips() <fiftyone.core.collections.SampleCollection.to_clips>`
  method for creating clips views into video datasets
- Added clip views sections to the :ref:`App user guide page <app-video-clips>`
  and :ref:`dataset views user guide page <clip-views>`
- Added support for :ref:`exporting video clips <export-label-coercion>` in
  labeled video formats
- Added a `trajectories=True` flag to
  :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
  that allows for matching entire object trajectories for which a given filter
  matches the object in at least one frame of the video
- Added set operations
  :meth:`is_subset() <fiftyone.core.expressions.ViewExpression.is_subset>`,
  :meth:`set_equals() <fiftyone.core.expressions.ViewExpression.set_equals>`,
  :meth:`unique() <fiftyone.core.expressions.ViewExpression.unique>`,
  :meth:`union() <fiftyone.core.expressions.ViewExpression.union>`,
  :meth:`intersection() <fiftyone.core.expressions.ViewExpression.intersection>`,
  :meth:`difference() <fiftyone.core.expressions.ViewExpression.difference>`, and
  :meth:`contains(all=True) <fiftyone.core.expressions.ViewExpression.contains>`
  to the view expression API
- Added date operations
  :meth:`to_date() <fiftyone.core.expressions.ViewExpression.to_date>`,
  :meth:`millisecond() <fiftyone.core.expressions.ViewExpression.millisecond>`,
  :meth:`second() <fiftyone.core.expressions.ViewExpression.second>`,
  :meth:`minute() <fiftyone.core.expressions.ViewExpression.minute>`,
  :meth:`hour() <fiftyone.core.expressions.ViewExpression.hour>`,
  :meth:`day_of_week() <fiftyone.core.expressions.ViewExpression.day_of_week>`,
  :meth:`day_of_month() <fiftyone.core.expressions.ViewExpression.day_of_month>`,
  :meth:`day_of_year() <fiftyone.core.expressions.ViewExpression.day_of_year>`,
  :meth:`month() <fiftyone.core.expressions.ViewExpression.month>`, and
  :meth:`year() <fiftyone.core.expressions.ViewExpression.year>`
  to the view expression API
- Missing ground truth/predictions are now included by default when viewing
  :ref:`confusion matrices <confusion-matrix-plots>` for detection tasks

Annotation

- Added support for specifying per-class attributes when
  :ref:`defining a label schema <annotation-label-schema>` for an annotation
  task
- Added support for specifying whether labels can be added, deleted or moved
  and whether certain label attributes are read-only when
  :ref:`configuring an annotation task <annotation-restricting-edits>`
- Added support for respecting keyframe information when adding or editing
  :ref:`video annotations <annotation-labeling-videos>`
- Fixed a 0-based versus 1-based frame numbering bug when
  :ref:`importing <CVATVideoDataset-import>` and
  :ref:`exporting <CVATVideoDataset-export>` labels in CVAT video format
- Added support for adding/editing bounding box shapes (not tracks) if desired
  when annotating video frames using the :ref:`CVAT backend <cvat-integration>`
- Fixed a bug that prevented importing of video annotations from the CVAT
  backend that involved the splitting or merging of object tracks
- Added a `project_name` parameter that allows for
  :ref:`creating annotation tasks <cvat-requesting-annotations>` within a new
  project when using the CVAT backend
- Added support for specifying a list of task assignees when creating video
  annotation tasks (which generate one task per video) using the CVAT backend
- Fixed a bug when adding/editing boolean attributes in an annotation task
  using the CVAT backend
- Added a new `occluded` attribute type option that links an attribute to the
  builtin occlusion icon when
  :ref:`annotating label attributes <cvat-label-attributes>` using the CVAT
  backend

.. _release-notes-v0.13.3:

FiftyOne 0.13.3
---------------
*Released September 22, 2021*

App

- Improved the efficiency of loading label graphs for fields with many distinct
  values
- Fixed some audio-related bugs when viewing video samples with audio channels
- Fixed a bug that prevented boolean App filters from working properly

Core

- Added support for importing/exporting segmentation masks with greater than
  256 classes when working with the
  :ref:`ImageSegmentationDirectory <ImageSegmentationDirectory-export>` format
- Added support for importing GeoTIFF images via a new
  :ref:`GeoTIFFDataset <GeoTIFFDataset-import>` format
- Added new
  :meth:`split_labels() <fiftyone.core.collections.SampleCollection.split_labels>`
  and :meth:`merge_labels() <fiftyone.core.collections.SampleCollection.merge_labels>`
  methods that provide convenient syntaxes for moving labels between new and
  existing label fields of a dataset
- Added :meth:`ensure_frames() <fiftyone.core.dataset.Dataset.ensure_frames>`
  and :meth:`clear_frames() <fiftyone.core.dataset.Dataset.clear_frames>`
  methods that can be used to conveniently initialize and clear the frames of
  video datasets, respectively
- Added support for using a MongoDB dataset whose version is
  :ref:`not explicitly supported <configuring-mongodb-connection>`
- Removed the `opencv-python-headless` maximum version requirement
- Fixed a race condition that could prevent callbacks on
  :ref:`interactive plots <interactive-plots>` from working properly on
  sufficiently large datasets

Annotation

- Added support for annotating semantic segmentations and instance
  segmentations using the :ref:`CVAT backend <cvat-requesting-annotations>`
- Added support for annotating polylines using the CVAT backend
- Added support for immutable attributes when annotating object tracks for
  video datasets using the CVAT backend
- Exposed the `use_cache`, `use_zip_chunks`, and `chunk_size` parameters when
  uploading annotations via the CVAT backend
- Fixed a bug that prevented multiple imports of the same annotation run from
  working as expected when a label is deleted but then later re-added
- Fixed a bug that prevented annotations for new label fields of video datasets
  from being imported properly
- Fixed a bug that would cause unsuppoted shapes such as polygons with less
  than 3 vertices to be deleted when editing existing labels with the CVAT
  backend

.. _release-notes-v0.13.2:

FiftyOne 0.13.2
---------------
*Released September 3, 2021*

App

- Improved aggregation queries resulting in ~10x faster statistics load times
  and time-to-interaction in the Fields Sidebar!
- Optimized in-App tagging actions
- Fixed count inconsistencies for large sets of
  :class:`StringField <fiftyone.core.fields.StringField>` results in the
  Fields Sidebar

Core

- Added support for providing compound sort criteria when using the
  :meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>` stage
- Added support for configuring the wait time when using
  :meth:`Session.wait() <fiftyone.core.session.Session.wait>` to block
  execution until the App is closed, including support for serving forever
- Fixed errors experienced by Windows users when running FiftyOne APIs that
  involved multiprocessing
- Resolved errors that could occur when importing CVAT XML files with
  empty-valued attributes in their schema and/or individual labels
- Added support for importing CVAT-style attributes when loading labels in
  COCO and VOC formats

.. _release-notes-v0.13.1:

FiftyOne 0.13.1
---------------
*Released August 25, 2021*

App

- Fixed `id` rendering in the grid when the `id` checkbox is active

Annotation

- Fixed a bug that could cause mismatches between media and their pre-existing
  labels when uploading data to CVAT for annotation whose source media lives in
  multiple directories

.. _release-notes-v0.13.0:

FiftyOne 0.13.0
---------------
*Released August 24, 2021*

App

- Added support for visualizing and filtering list fields
- Added support for visualizing segmentation masks of any integer type (uint8,
  uint16, etc.)
- Improved handling of falsey field values in the fields sidebar and image
  vizualizer
- Improved the JSON display format available from the expanded sample modal
- Resolved an issue that caused some users to see duplicate App screenshots
  when calling :meth:`Session.freeze() <fiftyone.core.session.Session.freeze>`
  in Jupyter notebooks
- Fixed a bug that prevented users from being able to click left/right arrows
  to navigate between samples in the expanded sample modal when working in
  Jupyter notebooks
- Fixed a bug where pressing the `ESC` key had no effect in the expanded sample
  modal when working with datasets with no label fields
- Fixed a bug that prevented the desktop App from launching when using source
  builds

Brain

- Added new
  :meth:`find_unique() <fiftyone.brain.similarity.DuplicatesMixin.find_unique>`,
  :meth:`unique_view() <fiftyone.brain.similarity.DuplicatesMixin.unique_view>`, and
  :meth:`visualize_unique() <fiftyone.brain.similarity.DuplicatesMixin.visualize_unique>`
  methods to the |SimilarityIndex| object returned by
  :meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that enable
  you to identify a maximally unique set of images or objects in a dataset
- Added new
  :meth:`find_duplicates() <fiftyone.brain.similarity.DuplicatesMixin.find_duplicates>`,
  :meth:`duplicates_view() <fiftyone.brain.similarity.DuplicatesMixin.duplicates_view>`, and
  :meth:`visualize_duplicates() <fiftyone.brain.similarity.DuplicatesMixin.visualize_duplicates>`
  methods to the |SimilarityIndex| object returned by
  :meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that enable
  you to identify near-duplicate images or objects in a dataset
- Added a new
  :meth:`compute_exact_duplicates() <fiftyone.brain.compute_exact_duplicates>`
  method that can identify exactly duplicate media in a dataset

Core

- Added support for pip-installing FiftyOne on Apple Silicon Macs. Note that
  MongoDB must be :ref:`self-installed <configuring-mongodb-connection>` in
  this case
- Added support for using a
  :ref:`self-installed MongoDB database <configuring-mongodb-connection>`
- Added a :meth:`group_by() <fiftyone.core.collections.SampleCollection.group_by>`
  view stage that allows for reorganizing the samples in a collection so that
  they are grouped by a specified field or expression
- Added a
  :meth:`selection_mode <fiftyone.core.plots.base.InteractivePlot.selection_mode>`
  property that enables users to change the behavior of App updates when
  selections are made in an interactive plot linked to labels. See
  :ref:`this page <plot-selection-modes>` for details
- Added support for :ref:`YOLOv5 YAML files <YOLOv5Dataset-import>` with
  multiple directories per dataset split
- Added support for importing/exporting confidences via the `score` field when
  working with :ref:`BDD format <BDDDataset-import>`
- Fixed some Windows-style path bugs

Annnotation

- Added a powerful :ref:`annotation API <fiftyone-annotation>` that makes it
  easy to add or edit labels on your FiftyOne datasets or specific views into
  them
- Added a native :ref:`CVAT integration <cvat-integration>` that enables you
  to use the annotation API with
  `CVAT <https://github.com/opencv/cvat>`_

Docs

- Added a :doc:`CVAT annotation tutorial </tutorials/cvat_annotation>`
- Added a :ref:`new example <brain-similarity-cifar10>` to the brain user guide
  that demonstrates unique and near-duplicate image workflows
- Added an object embeddings example to the
  :ref:`embeddings visualization section <brain-embeddings-visualization>` of
  the brain user guide
- Added a :ref:`new section <plot-selection-modes>` to the plots user guide
  page explaining how to control the selection mode of interactive plots linked
  to labels

.. _release-notes-v0.12.0:

FiftyOne 0.12.0
---------------
*Released August 10, 2021*

App

- Resolved performance issues with scrolling via grid virtualization. Toggling
  fields or selecting samples is no longer impacted by the amount of samples
  that have been loaded
- Added the `Show label` option in the expanded sample view to toggle the label
  text above detections boxes
- Added support for zooming and panning in the expanded sample view
- Added support for cropping and zooming to content in the expanded sample view
- Added support for visualizing multiple segmentation frame fields
  simultaneously
- Added label streaming to the video visualizer
- Added volume and playback rate settings to the video visualizer
- Added the `Crop to content` option in patches or evaluation patches views
  which crops samples to only show the labels that make up the patch. Defaults
  to `True`
- Added count and filtered count values to categorical filters
  (:class:`BooleanField <fiftyone.core.fields.BooleanField>` and
  :class:`StringField <fiftyone.core.fields.StringField>` fields)

Core

- Added support for importing :ref:`DICOM datasets <DICOMDataset-import>`
- Added better default behavior for the `label_field` parameter when importing
  datasets using methods like
  :meth:`from_dir() <fiftyone.core.dataset.Dataset.from_dir>` and exporting
  datasets using
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
- When adding samples to datasets, `None`-valued sample fields are now
  gracefully ignored when expanding dataset schemas

Docs

- Added :ref:`Using the image visualizer <app-image-visualizer>` and
  :ref:`Using the video visualizer <app-video-visualizer>` sections to the
  App user guide
- Added sections covering :ref:`merging datasets <merging-datasets>` and
  :ref:`batch updates <batch-updates>` to the dataset user guide page

Zoo

- Patched an Open Images issue where `classes` or `attrs` requirements were
  being ignored when loading a dataset with no `max_samples` requirement

.. _release-notes-v0.11.2.1:

FiftyOne 0.11.2.1
-----------------
*Released July 31, 2021*

Zoo

- Patched an Open Images issue where label files were not being downloaded
  when running a :meth:`load_zoo_dataset() <fiftyone.zoo.load_zoo_dataset>`
  call that does not include `classes` or `attrs` options in an environment
  where Open Images has never been downloaded
- Patched loading of Cityscapes datasets
- Patched loading of COCO datasets

.. _release-notes-v0.11.2:

FiftyOne 0.11.2
---------------
*Released July 27, 2021*

App

- Added support for calling
  :meth:`Session.open_tab() <fiftyone.core.session.Session.open_tab>` from
  :ref:`remote Jupyter notebooks <remote-notebooks>`
- Fixed a bug that could cause
  :meth:`Session.wait() <fiftyone.core.session.Session.wait>` to exit when the
  App's tab is refreshed in the browser

Core

- Added a ``plotly<5`` requirement, which prevents an issue that may cause
  callbacks for selection events in
  :ref:`interactive plots <interactive-plots>` to not trigger as expected when
  using Plotly V5
- Added support for evaluating polygons and instance segmentations to
  :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`.
  See :ref:`this page <evaluation-detection-types>` for usage details
- Added support for creating :ref:`patch views <frame-patches-views>` and
  :ref:`evaluation patch views <evaluating-videos>` into the frames of video
  datasets
- Greatly improved the efficiency of creating
  :ref:`evaluation patch views <evaluation-patches>`
- Added support for recursively listing data directories when loading datasets
  :ref:`from disk <loading-datasets-from-disk>`
- Added support for controlling whether/which object attributes are
  imported/exported in formats like :ref:`COCO <COCODetectionDataset-import>`
  that support arbitrary object attributes
- Updated all dataset import/export routines to support/prefer custom object
  attributes stored directly on |Label| instances as dynamic fields rather
  than in the `attributes` dict
- The :ref:`ImageSegmentationDirectory <ImageSegmentationDirectory-export>`
  format now supports exporting segmentations defined by |Detections| with
  instance masks and |Polylines|
- Added an
  :meth:`objects_to_segmentations() <fiftyone.utils.labels.objects_to_segmentations>`
  utility for converting |Detections| with instance fields and |Polylines| to
  |Segmentation| format
- Added graceful handling of edges cases like empty views and missing labels to
  all :ref:`evaluation routines <evaluating-models>`
- Added improved support for
  :meth:`creating <fiftyone.core.collections.SampleCollection.create_index>`,
  :meth:`viewing <fiftyone.core.collections.SampleCollection.get_index_information>`,
  and :meth:`dropping <fiftyone.core.collections.SampleCollection.drop_index>`
  dropping sample- and frame-level indexes on datasets
- Added additional indexes on patch and frames views to enable efficient
  ID-based queries
- Added support for gracefully loading and deleting evaluations and brain
  methods executed in future versions of FiftyOne (e.g., after
  :ref:`downgrading <downgrading-fiftyone>` your FiftyOne package version)
- Added an optional ``progress`` flag to
  :meth:`iter_samples() <fiftyone.core.collections.SampleCollection.iter_samples>`
  that renders a progress bar tracking the progress of the iteration
- Added support for installing FiftyOne on RHEL7 (Red Hat Enterprise Linux)
- A helpful error message is now raised when a user tries to load a dataset
  from a future version of FiftyOne without following the
  :ref:`downgrade instructions <downgrading-fiftyone>`
- Fixed a bug that prevented FiftyOne from being imported on read-only
  filesystems
- Fixed a bug that prevented the proper loading of the
  :ref:`Open Images V6 <dataset-zoo-open-images-v6>` dataset after partial
  downloads involving only a subset of the available label types

Zoo

- Added support for importing license data when loading the
  :ref:`COCO-2014 <dataset-zoo-coco-2014>` and
  :ref:`COCO-2017 <dataset-zoo-coco-2017>` datasets from the zoo
- The inapplicable ``classes`` flag will now be ignored when loading the
  unlabeled test split of :ref:`COCO-2014 <dataset-zoo-coco-2014>` and
  :ref:`COCO-2017 <dataset-zoo-coco-2017>`
- Improved the partial download behavior of the
  :ref:`Open Images V6 <dataset-zoo-open-images-v6>` dataset when the optional
  ``classes`` and ``attrs`` parameters are provided
- Fixed a bug that prevented Windows users from downloading the
  :ref:`Open Images V6 <dataset-zoo-open-images-v6>` dataset

.. _release-notes-v0.11.1:

FiftyOne 0.11.1
---------------
*Released June 29, 2021*

App

- Updated the expired `Slack community link <https://slack.voxel51.com>`_ in
  the App menu bar

.. _release-notes-v0.11.0:

FiftyOne 0.11.0
---------------
*Released June 29, 2021*

News

- With support from the `COCO team <https://cocodataset.org/#download>`_,
  FiftyOne is now a recommended tool for downloading, visualizing, and
  evaluating on the COCO dataset! Check out :ref:`this guide <coco>` for more
  details

App

- Fixed a bug that prevented ``sample_id`` fields from appearing in the App
  when working with frames and patches views

Core

- Added various new parameters to methods like
  :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` and
  :meth:`SampleCollection.export() <fiftyone.core.collections.SampleCollection.export>`,
  including ``data_path``, ``labels_path``, and ``export_media`` that allow for
  customizing the import and export of datasets. For example, you can now
  perform labels-only imports and exports
- Added new
  :meth:`Dataset.merge_dir() <fiftyone.core.dataset.Dataset.merge_dir>` and
  :meth:`Dataset.merge_importer() <fiftyone.core.dataset.Dataset.merge_importer>`
  methods for merging datasets from disk into existing FiftyOne datasets
- Added support for :ref:`importing <YOLOv5Dataset-import>` and
  :ref:`exporting <YOLOv5Dataset-export>` datasets in
  `YOLOv5 format <https://github.com/ultralytics/yolov5>`_
- Updated the :class:`GeoJSONDataset <fiftyone.types.GeoJSONDataset>` dataset
  type to support both image and video datasets
- Added support for :class:`importing <fiftyone.utils.coco.COCODetectionDatasetImporter>`
  and :class:`exporting <fiftyone.utils.coco.COCODetectionDatasetExporter>` extra
  attributes in COCO format via a new ``extra_attrs`` parameter

Zoo

- Added support for partial downloads and loading segmentations to the
  :ref:`COCO-2014 <dataset-zoo-coco-2014>` and
  :ref:`COCO-2017 <dataset-zoo-coco-2017>` datasets
- When performing partial downloads on the
  :ref:`Open Images v6 Dataset <dataset-zoo-open-images-v6>` involving a subset
  of the available classes, all labels for matching samples will now be loaded
  by default

Docs

- Added a :ref:`new page <coco>` demonstrating how to use FiftyOne to download,
  visualize, and evaluate on the COCO dataset
- Added a :ref:`new page <open-images>` demonstrating how to use FiftyOne to
  download, visualize, and evaluate on the Open Images dataset

.. _release-notes-v0.10.0:

FiftyOne 0.10.0
---------------
*Released June 21, 2021*

News

- We've collaborated with the
  `PyTorch Lightning <https://github.com/PyTorchLightning/pytorch-lightning>`_
  team to make it easy to train
  `Lightning Flash <https://github.com/PyTorchLightning/lightning-flash>`_
  tasks on your FiftyOne datasets. Check out
  :ref:`this guide <lightning-flash>` for more details

Core

- Updated the
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>` and
  :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
  methods to natively support applying
  `Lightning Flash <https://github.com/PyTorchLightning/lightning-flash>`_
  models to FiftyOne datasets!

Docs

- Added a :ref:`new page <lightning-flash>` demonstrating how to use the
  Lightning Flash integration

.. _release-notes-v0.9.4:

FiftyOne 0.9.4
--------------
*Released June 15, 2021*

App

- Added support for matching samples by ID in the Filters Sidebar
- Fixed a bug that caused the App to crash when selecting samples with the
  ``Color by value`` setting active
- Fixed a bug that caused the App to crash on some Windows machines by ensuring
  the correct MIME type is set for JavaScript files

Core

- Improved the performance of importing data into FiftyOne by 2x or more!
- Added a
  :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>` view
  stage that enables on-the-fly conversion of video datasets into frames views
- Added :meth:`last() <fiftyone.core.frame.Frames.last>`,
  :meth:`head() <fiftyone.core.frame.Frames.head>`, and
  :meth:`tail() <fiftyone.core.frame.Frames.tail>` methods to the
  :class:`Frames <fiftyone.core.frame.Frames>` class
- Added new
  :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`,
  :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`, and
  :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
  view stages that enable selecting specific frames of video collections via
  IDs or filter expressions, respectively
- Added a new
  :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
  view stage that enables matching samples that have specific labels without
  actually filtering the non-matching labels
- Added support for exporting image patches using
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>` by
  specifying an image classification dataset type and including a spatial
  ``label_field`` that defines the image patches to extract
- Added support for automatically coercing single label fields like |Detection|
  into the corresponding multiple label field type |Detections| when using
  :meth:`export() <fiftyone.core.collections.SampleCollection.export>` to
  export in dataset formats that expect list-type fields
- Added support for executing an aggregation on multiple fields via the
  abbreviated syntax
  ``ids, filepaths = dataset.values(["id", "filepath"])``
- Exposed the ``id`` field of all samples and frames in dataset schemas
- Added support for merging the elements of list fields via
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` and
  :meth:`Document.merge() <fiftyone.core.document.Document.merge>`
- Added a number of useful options to
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`,
  including ``fields``, ``omit_fields``, and ``merge_lists``
- Improved the efficiency of
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`
  when the ``overwrite=False`` option is provided
- Added an optional ``bool`` flag to the
  :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
  view stage that allows for optionally matching samples without the specified
  tags
- Added support for computing filehashes via the ``hashlib`` module to
  :meth:`compute_filehash() <fiftyone.core.utils.compute_filehash>`
- Updated the :meth:`import_from_labelbox() <fiftyone.utils.labelbox.import_from_labelbox>`
  method to use the correct label ID ("DataRow ID", not "ID")
- Added an optional ``edges`` argument to
  :meth:`scatterplot() <fiftyone.core.plots.plotly.scatterplot>` and
  :meth:`location_scatterplot() <fiftyone.core.plots.plotly.scatterplot>` that
  enables drawing undirected edges between scatterpoints
- Fixed a bug in
  :meth:`limit_labels() <fiftyone.core.collections.SampleCollection.limit_labels>`
  that would cause views to contain empty label lists if the source dataset
  contains None-valued fields
- Fixed a bug that prevented
  :meth:`ViewExpression.contains() <fiftyone.core.expressions.ViewExpression.contains>`
  from accepting |ViewExpression| instances as arguments

Zoo

- Fixed a string encoding issue that prevented some Windows users from loading
  the :ref:`Open Images V6 <dataset-zoo-open-images-v6>` dataset
- Updated the :ref:`vgg16-imagenet-tf1 <model-zoo-vgg16-imagenet-tf1>` model
  (formerly named `vgg16-imagenet-tf`) to reflect the fact that it only
  supports TensorFlow 1.X

Docs

- Added example usages of
  :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`
  to the :ref:`user guide <frame-views>`

.. _release-notes-v0.9.3:

FiftyOne 0.9.3
--------------
*Released May 18, 2021*

App

- Fixed an issue that prevented some datasets and views that contain vector or
  array data (e.g., logits) from properly loading in the App
- Fixed a bug that prevented loading video datasets in the App in Google Colab
  environments

.. _release-notes-v0.9.2:

FiftyOne 0.9.2
--------------
*Released May 16, 2021*

Zoo

- Fixed a multiprocessing bug that prevented Mac users running Python 3.8 or
  later from loading the :ref:`Open Images V6 <dataset-zoo-open-images-v6>`
  dataset

.. _release-notes-v0.9.1:

FiftyOne 0.9.1
--------------
*Released May 12, 2021*

App

- Fixed a bug that caused the App to crash when choosing to ``Color by value``

.. _release-notes-v0.9.0:

FiftyOne 0.9.0
--------------
*Released May 12, 2021*

News

- We've collaborated with the
  `Open Images Team at Google <https://storage.googleapis.com/openimages/web/download.html>`_
  to make FiftyOne a recommended tool for downloading, visualizing, and
  evaluating on the Open Images Dataset! Check out
  :ref:`this guide <open-images>` for more details

App

- Added a `Patches` action for easy switching to object/evaluation patches
  views. See :ref:`this page <app-object-patches>` for usage details
- Added a `Sort by similarity` action that enables sorting by similarity to the
  selected samples/patches. See :ref:`this page <app-similarity>` for usage
  details
- Added a zoom slider in the top right of the sample grid that adjusts the tile
  size of the sample grid
- Added the ability to clear filters for entire field groups, e.g. `Labels` and
  `Scalars`, in the Filters Sidebar
- Added `filepath` to the `Scalars` group in the Filters Sidebar
- Added a `Label tags` graphs tab
- Refreshed numeric, string, and boolean filter styles with improved
  functionality and interaction
- Added support for :meth:`Session.wait() <fiftyone.core.session.Session.wait>`
  in browser contexts

Brain

- Added a :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
  method for indexing samples and object patches by similarity. See
  :ref:`this page <brain-similarity>` for usage details

Core

- Added support for Open Images-style detection evaluation when using
  :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`.
  See :ref:`this page <evaluating-detections-open-images>` for usage details
- Added the
  :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
  and
  :meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
  view stages for transforming collections into flattened views with respect to
  labels and evaluations, respectively.
  See :ref:`this page <object-patches-views>` for usage details
- Added support for applying image models to the frames of video datasets
  when using
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
  :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`, and
  :meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
- Added full support for embedded documents (e.g. labels) in
  :meth:`values() <fiftyone.core.collections.SampleCollection.values>` and
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
- Added support for passing expressions directly to
  :ref:`aggregations <using-aggregations>`
- Added an optional `omit_empty` flag to
  :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`
  and
  :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
  that controls whether samples with no labels are omitted when filtering
- Added a
  :meth:`Dataset.delete_labels() <fiftyone.core.dataset.Dataset.delete_labels>`
  method for efficiently deleting labels via a variety of natural syntaxes
- Deprecated
  :meth:`Dataset.remove_sample() <fiftyone.core.dataset.Dataset.remove_sample>`
  and
  :meth:`Dataset.remove_samples() <fiftyone.core.dataset.Dataset.remove_samples>`
  in favor of a single
  :meth:`Dataset.delete_samples() <fiftyone.core.dataset.Dataset.delete_samples>`
  method
- Brain results and evaluation results that are loaded via
  :meth:`load_evaluation_results() <fiftyone.core.collections.SampleCollection.load_evaluation_results>`
  :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
  are now cached on the |Dataset| object in-memory so that subsequent
  retrievals of the results in the same session will be instant

Zoo

- Added :ref:`Open Images V6 <dataset-zoo-open-images-v6>` to the dataset zoo!

Docs

- Added a new :doc:`Open Images tutorial </tutorials/open_images>`
- Added :ref:`object patches <app-object-patches>` and
  :ref:`evaluation patches <app-evaluation-patches>` sections to the
  :ref:`App guide <fiftyone-app>`
- Added a :ref:`similarity <brain-similarity>` section to the
  :ref:`Brain guide <fiftyone-brain>`
- Added :ref:`Open Images evaluation <evaluating-detections-open-images>` and
  :ref:`evaluation patches <evaluation-patches>` sections to the
  :ref:`evaluation guide <evaluating-models>`
- Added :ref:`object patches <object-patches-views>` and
  :ref:`evaluation patches <eval-patches-views>` sections to the
  :ref:`views guide <using-views>`
- Added example uses of
  :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
  and
  :meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
  to the :doc:`object detection tutorial </tutorials/evaluate_detections>`
- Added example use of
  :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
  to the :doc:`detection mistakes tutorial </tutorials/detection_mistakes>`
- Added example use of
  :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
  to the :doc:`adding detections recipe </recipes/adding_detections>`

.. _release-notes-v0.8.0:

FiftyOne 0.8.0
--------------
*Released April 5, 2021*

App

- Added the ability to tag samples and labels directly from the App in both
  the sample grid (macro) and expanded sample view (micro) with respect to and
  filters or currently selected samples/labels
- Added a `LABEL TAGS` section to the Filters Sidebar to coincide with the
  introduction of label tags
- Added label tooltips that display on hover in the expanded sample view
- Expanded actions to list of button groups in the sample grid and expanded
  sample view
- Added support for rendering semantic labels in the new tooltip in the expanded
  sample view for :class:`Segmentation <fiftyone.core.labels.Segmentation>`
  mask values (pixel values) using the new
  :attr:`Dataset.mask_targets <fiftyone.core.dataset.Dataset.mask_targets>`
  and
  :attr:`Dataset.default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
  fields
- Fixed hiding, clearing, and only showing selected samples in the samples grid

Brain

- Added a :meth:`compute_visualization() <fiftyone.brain.compute_visualization>` method that uses embeddings and dimensionality reduction methods to generate interactive visualizations of the samples and/or labels in a dataset. Check out :ref:`this page <brain-embeddings-visualization>` for details. Features include:
    - Provide your own embeddings, or choose a model from the
      :ref:`Model Zoo <model-zoo>`, or use the provided default model
    - Supported dimensionality reduction methods include
      `UMAP <https://github.com/lmcinnes/umap>`_,
      `t-SNE <https://lvdmaaten.github.io/tsne>`_, and
      `PCA <https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.PCA.html>`_
    - Use this capability in a Jupyter notebook and you can interact with the
      plots to select samples/labels of interest in a connected |Session|
- Added support for saving brain method results on datasets. Previous brain
  results can now be loaded at any time via
  :meth:`Dataset.load_brain_results() <fiftyone.core.dataset.Dataset.load_brain_results>`
- Added support for providing a custom |Model| or model from the
  :ref:`Model Zoo <model-zoo>` to
  :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`

Core

- Added a :mod:`fiftyone.core.plots` module that provides a powerful API for visualizing datasets, including interactive plots when used in Jupyter notebooks. See :ref:`this page <interactive-plots>` for more information. Highlights include:
    - :meth:`plot_confusion_matrix() <fiftyone.core.plots.base.plot_confusion_matrix>`:
      an interactive confusion matrix that can be attached to a |Session|
      object to visually explore model predictions
    - :meth:`scatterplot() <fiftyone.core.plots.base.scatterplot>`: an
      interacive scatterplot of 2D or 3D points that can be attached to a
      |Session| to explore the samples/labels in a dataset based on their
      locations in a low-dimensional embedding space
    - :meth:`location_scatterplot() <fiftyone.core.plots.base.location_scatterplot>`:
      an interacive scatterplot of a dataset via its |GeoLocation| coordinates
    - Added |GeoLocation| and |GeoLocations| label types that can be used to store
      arbitrary GeoJSON location data on samples
    - Added the :class:`GeoJSONDataset <fiftyone.types.GeoJSONDataset>` dataset
      type for importing and exporting datasets in GeoJSON format
    - Added :meth:`SampleCollection.geo_near() <fiftyone.core.collections.SampleCollection.geo_near>`
      and
      :meth:`SampleCollection.geo_within() <fiftyone.core.collections.SampleCollection.geo_within>`
      view stages for querying datasets with location data
- Upgraded the implementation of the
  :ref:`FiftyOneDataset <FiftyOneDataset-export>` format, which is now 10-100x
  faster at importing/exporting datasets
- Added support for generating zip/tar/etc archives to
  :meth:`SampleCollection.export() <fiftyone.core.collections.SampleCollection.export>`
  by passing an archive path rather than a directory path
- Added :meth:`Dataset.from_archive() <fiftyone.core.dataset.Dataset.from_archive>`
  and :meth:`Dataset.add_archive() <fiftyone.core.dataset.Dataset.add_archive>`
  factory methods for importing datasets stored in archives
- Added support for saving evaluation results on a dataset. Results can now
  be loaded at any time via
  :meth:`Dataset.load_evaluation_results() <fiftyone.core.dataset.Dataset.load_evaluation_results>`
- Added a ``tags`` attribute to all |Label| types that can store a list of
  string tags for the labels (analogous to the ``tags`` attribute of |Sample|)
- Added a number of methods for working with sample and label tags:
   - :meth:`SampleCollection.tag_samples() <fiftyone.core.collections.SampleCollection.tag_samples>`
   - :meth:`SampleCollection.untag_samples() <fiftyone.core.collections.SampleCollection.untag_samples>`
   - :meth:`SampleCollection.count_sample_tags() <fiftyone.core.collections.SampleCollection.count_sample_tags>`
   - :meth:`SampleCollection.tag_labels() <fiftyone.core.collections.SampleCollection.tag_labels>`
   - :meth:`SampleCollection.untag_labels() <fiftyone.core.collections.SampleCollection.untag_labels>`
   - :meth:`SampleCollection.count_label_tags() <fiftyone.core.collections.SampleCollection.count_label_tags>`
- **BREAKING CHANGE**: Renamed all applicable API components that previously referenced "objects" to use the more widely applicable term "labels". Affected attributes, classes, and methods are:
   - :attr:`Session.selected_labels <fiftyone.core.session.Session.selected_labels>` (previously `selected_objects`)
   - :meth:`SampleCollection.select_labels() <fiftyone.core.collections.SampleCollection.select_labels>` (previously `select_labels()`)
   - :meth:`SampleCollection.select_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>` (previously `exclude_labels()`)
   - :class:`SelectLabels <fiftyone.core.stages.SelectLabels>` (previously `SelectObjects`)
   - :class:`ExcludeLabels <fiftyone.core.stages.ExcludeLabels>` (previously `ExcludeObjects`)
- Added new keyword arguments ``ids``, ``tags``, and ``fields`` to
  :meth:`SampleCollection.select_labels() <fiftyone.core.collections.SampleCollection.select_labels()>`
  and
  :meth:`SampleCollection.select_labels() <fiftyone.core.collections.SampleCollection.exclude_labels()>`
  and their corresponding view stages that enable easier-to-use selection of
  labels by their IDs or tags
- Added
  :meth:`Session.select_labels() <fiftyone.core.session.Session.select_labels()>`
  for programmatically selecting labels as well a setters for
  :attr:`Session.selected <fiftyone.core.session.Session.selected>` and
  :attr:`Session.selected_labels <fiftyone.core.session.Session.selected_labels>`
- Added :attr:`Dataset.classes <fiftyone.core.dataset.Dataset.classes>`
  and
  :attr:`Dataset.default_classes <fiftyone.core.dataset.Dataset.default_classes>`
  fields that enable storing class label lists at the dataset-level that can be
  automatically used by methods like
  :meth:`Dataset.evaluate_classifications() <fiftyone.core.dataset.Dataset.evaluate_detections>`
  when knowledge of the full schema of a model is required
- Added :attr:`Dataset.mask_targets <fiftyone.core.dataset.Dataset.mask_targets>`
  and
  :attr:`Dataset.default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
  fields for providing semantic labels for
  :class:`Segmentation <fiftyone.core.labels.Segmentation>` mask values to be
  used in the App's expanded sample view
- Improved the runtime of
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` by
  ~100x for image datasets and ~10x for video datasets
- Added an :meth:`Dataset.add_collection() <fiftyone.core.dataset.Dataset.add_collection>`
  method for adding the contents of a |SampleCollection| to another |Dataset|
- Added the trigonometric view expresssions
  :meth:`cos <fiftyone.core.expressions.ViewExpression.cos>`,
  :meth:`sin <fiftyone.core.expressions.ViewExpression.sin>`,
  :meth:`tan <fiftyone.core.expressions.ViewExpression.tan>`,
  :meth:`cosh <fiftyone.core.expressions.ViewExpression.cosh>`
  :meth:`sinh <fiftyone.core.expressions.ViewExpression.sinh>`,
  :meth:`tanh <fiftyone.core.expressions.ViewExpression.tanh>`,
  :meth:`arccos <fiftyone.core.expressions.ViewExpression.arccos>`,
  :meth:`arcsin <fiftyone.core.expressions.ViewExpression.arcsin>`,
  :meth:`arcan <fiftyone.core.expressions.ViewExpression.arctan>`
  :meth:`arccosh <fiftyone.core.expressions.ViewExpression.arccosh>`,
  :meth:`arcsinh <fiftyone.core.expressions.ViewExpression.arcsinh>`, and
  :meth:`arctanh <fiftyone.core.expressions.ViewExpression.arctanh>`
- Added a :class:`randn <fiftyone.core.expressions.ViewExpression.randn>`
  expression that can generate Gaussian random numbers
- Fixed a bug that prevented
  :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
  from being able to process video datasets
- Added support for applying intensive view stages such as sorting to datasets
  whose database representation exceeds 100MB
- Fixed schema errors in |DatasetView| instances that contain selected or
  excluded fields
- Fixed copying of |DatasetView| instances where
  :class:`ViewField <fiftyone.core.expressions.ViewField>` is used

Zoo

- Added the :ref:`quickstart-geo <dataset-zoo-quickstart-geo>` dataset to
  enable quick exploration of location-based datasets

CLI

- Removed the `--desktop` flag from the
  :ref:`fiftyone app connect <cli-fiftyone-app-connect>` command

Docs

- Added :doc:`a tutorial </tutorials/image_embeddings>` demonstrating how to
  use :meth:`compute_visualization() <fiftyone.brain.compute_visualization>`
  on image datasets
- Added an :ref:`interactive plots <interactive-plots>` page to the user guide
- Added a :ref:`Tags and tagging <app-tagging>` section to the App user guide
- Added a :ref:`visualizing embedding <brain-embeddings-visualization>` section
  to the Brain user guide

.. _release-notes-v0.7.4:

FiftyOne 0.7.4
--------------
*Released March 2, 2021*

App

- Fixed a bug that prevented |Session| updates from triggering App updates
- Fixed hiding labels in the expanded sample view

Brain

- Added support for tracking and cleaning up brain runs similar to how
  evaluations are tracked. See
  :meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`,
  :meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`,
  :meth:`load_brain_view() <fiftyone.core.collections.SampleCollection.load_brain_view>`,
  and
  :meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`
  for details
- Updated :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`
  to use FiftyOne's evaluation framework

Core

- Decoupled loading video |Sample| and |SampleView| and their frames so the
  samples are loaded efficiently and frames are only loaded when requested
- Add a 90 character limit to progress bars in notebook contexts to prevent
  overflow issues
- Added low-level utility methods
  :meth:`list_datasets() <fiftyone.core.odm.database.list_datasets>` and
  :meth:`delete_dataset() <fiftyone.core.odm.database.delete_dataset>` for
  managing a corrupted database
- Added automatic field generation for `labelbox_id_field` when using
  :meth:`import_from_labelbox() <fiftyone.utils.labelbox.import_from_labelbox>`

CLI

- Added a :ref:`dataset stats <cli-fiftyone-datasets-stats>` command

.. _release-notes-v0.7.3:

FiftyOne 0.7.3
--------------
*Released February 18, 2021*

App

- Added filtering widgets to the Filters Sidebar for
  :class:`StringFields <fiftyone.core.fields.StringField>` and
  :class:`BooleanFields <fiftyone.core.fields.BooleanField>`
- Added histogram plots for
  :class:`StringFields <fiftyone.core.fields.StringField>` and
  :class:`BooleanFields <fiftyone.core.fields.BooleanField>` in the `Scalars`
  tab
- Moved `None` selection for
  :class:`StringFields <fiftyone.core.fields.StringField>` to the input format
  in the Filters Sidebar
- Changed `None` options to only be present when `None` values exist for a
  supported :class:`Field <fiftyone.core.fields.Field>` in the Filters Sidebar
- Added `Color by label` support for
  :class:`Classification <fiftyone.core.labels.Classification>`,
  :class:`Classifications <fiftyone.core.labels.Classifications>`,
  :class:`BooleanField <fiftyone.core.fields.BooleanField>`, and
  :class:`StringField <fiftyone.core.fields.StringField>`
- Added support excluding selected values for a
  :class:`StringField <fiftyone.core.fields.StringField>` in the Fields
  Sidebar
- Various style and interaction improvements in the Filters Sidebar
- The App will no longer crash when samples whose source media is unsupported
  or missing are loaded

Core

- Added
  :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`,
  :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`, and
  :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
  methods that provide support for evaluating various types of labels. See the
  new :ref:`evaluation page <evaluating-models>` of the user guide for more
  details
- Added :meth:`one() <fiftyone.core.collections.SampleCollection>` for retrieving
  one matched |Sample| from a |Dataset| or |DatasetView|
- Added support for cloning and saving views into video datasets via
  :meth:`clone() <fiftyone.core.view.DatasetView.clone>` and
  :meth:`save() <fiftyone.core.view.DatasetView.save>`
- Added support for extracting batches of frame-level and/or array fields via
  the :meth:`values() <fiftyone.core.collections.SampleCollection.values>`
  aggregation
- Added support for setting batches of frame-level and/or array fields via
  :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
- Added support for accessing samples from a |Dataset| or |DatasetView| via
  the `dataset[filepath]` syntax
- Added support for passing |Sample| and any |Sample| iterable, e.g.
  |DatasetView|, to methods like
  :meth:`remove_samples() <fiftyone.core.dataset.Dataset.remove_samples>`,
  :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`, and
  :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
- Changed the default value for `only_matches` for
  :meth:`filter_classifications() <fiftyone.core.collections.SampleCollection.filter_classifications>`,
  :meth:`filter_detections() <fiftyone.core.collections.SampleCollection.filter_detections>`,
  :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`,
  :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`,
  :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`,
  and
  :meth:`filter_polylines() <fiftyone.core.collections.SampleCollection.filter_polylines>`
  from `False` to `True`
- :meth:`compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`
  will now gracefully skip samples for which media metadata cannot be computed
- Added a :meth:`stats() <fiftyone.core.dataset.Dataset.stats>` method for
  listing helpful info about the size of various entities of a dataset

Zoo

- Added support for storing logits for many :ref:`zoo models <model-zoo>` when
  using
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
- Default confidence thresholds for :ref:`zoo models <model-zoo>` are now
  stored on a per-model basis rather than as a global default value in
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.
  All detection models still have a default confidence threshold of 0.3, and
  all other model types have no default confidence threshold

CLI

- Added a :ref:`migration API <downgrading-fiftyone>` to provide better support
  for downgrading the version of your `fiftyone` package

Docs

- Added a new :ref:`evaluation page <evaluating-models>` to the user guide that
  explains how to evaluate various types of models with FiftyOne
- Removed legacy `--index` flags from the install instructions from the
  :ref:`troubleshooting page <alternative-builds>` which prevented a valid
  installation

FiftyOne 0.7.2
--------------
*Released January 28, 2021*

App

- Changed the Filters Sidebar label filters to only return matched samples,
  i.e., samples with at least one matching label with respect to a filter
- Fixed a bug in Colab notebooks that allowed for the `.ipynb` file to grow
  unnecessarily large
- Improved plotting of numeric fields in the `Scalars` tab, including
  `[min, max)` ranges for tooltips and integer binning when appropriate
- Fixed a bug that prevented
  :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
  and
  :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
  from being properly respected by the Filters Sidebar
- Fixed a bug that prevented selected samples from being cleared when modifying
  your view or choosing an option from the select samples dropdown
- Added an |AppConfig| for configuring options like the color pool to use when
  drawing |Label| fields. See :ref:`this page <configuring-fiftyone-app>` for
  more info

Core

- Added the :class:`MapLabels <fiftyone.core.stages.MapLabels>` and
  :class:`SetField <fiftyone.core.stages.SetField>` view stages
- Added the
  :class:`HistogramValues <fiftyone.core.aggregations.HistogramValues>` and
  :class:`Sum <fiftyone.core.aggregations.Sum>` aggregations
- Added over a dozen new
  |ViewExpression| methods including powerful transformations like
  :meth:`map_values() <fiftyone.core.expressions.ViewExpression.map_values>`,
  :meth:`reduce() <fiftyone.core.expressions.ViewExpression.reduce>`, and
  :meth:`sort() <fiftyone.core.expressions.ViewExpression.sort>`
- Exposed all :class:`Aggregtaions <fiftyone.core.aggregations.Aggregation>` as
  single execution methods on the |SampleCollection| interface, e.g.,
  :meth:`distinct() <fiftyone.core.collections.SampleCollection.distinct>`
- Added support for all |Label| types in
  :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
- Added support for generalized field paths (embedded fields, lists, etc) to
  the :class:`Bounds <fiftyone.core.aggregations.Bounds>`,
  :class:`Count <fiftyone.core.aggregations.Count>`,
  :class:`CountValues <fiftyone.core.aggregations.CountValues>`, and
  :class:`Distinct <fiftyone.core.aggregations.Distinct>`
  aggregations
- Removed the deprecated
  :class:`ConfidenceBounds <fiftyone.core.aggregations.ConfidenceBounds>`,
  :class:`CountLabels <fiftyone.core.aggregations.CountLabels>`, and
  :class:`DistinctLabels <fiftyone.core.aggregations.DistinctLabels>`
  aggregations
- Removed the redundant
  :meth:`match_tag() <fiftyone.core.collections.SampleCollection.match_tag>`
  stage in favor of
  :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
- Removed `AggregationResult` classes in favor of returning
  :class:`Aggregation <fiftyone.core.aggregations.Aggregation>` results
  directly as builtin types
- Added the optional `config` keyword argument to
  :meth:`launch_app() <fiftyone.core.session.launch_app>` and
  :class:`Session <fiftyone.core.session.Session>` for overriding the default
  :ref:`AppConfig <configuring-fiftyone-app>`.

Zoo

- Added a default confidence threshold of `0.3` when applying models from the
  :ref:`Model Zoo <model-zoo>` via
  :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
  which omits spurious low quality predictions from many models

CLI

- Added a :ref:`fiftyone app config <cli-fiftyone-app-config>` command for
  inspecting the default :ref:`App config <configuring-fiftyone-app>`
- Improved `ctrl + c` exit handling for CLI commands

Docs

- Added a :ref:`new section <configuring-fiftyone-app>` to the
  :ref:`Configuring FiftyOne guide <configuring-fiftyone>` explaining how to
  programmatically configure the App's behavior
- Updated the :ref:`Dataset views guide <using-views>` to provide a thorough
  overview of new functionality provided by stages like
  :class:`SetField <fiftyone.core.stages.SetField>`
- Updated the :ref:`Aggregations guide <using-aggregations>` to provide a
  thorough overview and examples of various aggregation functionality,
  including advanced usage tips
- Added an FAQ section providing instructions for working with
  :ref:`remote Jupyter notebooks <faq-remote-notebook-support>`
- Added code examples to all |ViewStage| class docstrings and their
  corresponding sample collection methods, e.g.,
  :meth:`map_labels() <fiftyone.core.collections.SampleCollection.map_labels>`
- Added code examples to all |Aggregation| class docs and their corresponding
  sample collection methods, e.g.,
  :meth:`bounds() <fiftyone.core.collections.SampleCollection.bounds>`

.. _release-notes-v0.7.1:

FiftyOne 0.7.1
--------------
*Released January 8, 2021*

App

- Added automatic screenshotting for :ref:`notebook environments <notebooks>`
- Fixed a bug where the Filters Sidebar statistics would not load for empty
  views
- Fixed style inconsistencies in Firefox

Core

- Added :meth:`Session.freeze() <fiftyone.core.session.Session.freeze>` for
  manually screenshotting the active App in a notebook environment
- Renamed ``Dataset.clone_field()`` to
  :meth:`Dataset.clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`
  for consistency with other operations
- Added a
  :meth:`Dataset.clone_frame_field() <fiftyone.core.dataset.Dataset.clone_frame_field>`
  method for cloning frame-level fields of video datasets
- Added
  :meth:`DatasetView.clone_sample_field() <fiftyone.core.view.DatasetView.clone_sample_field>`
  and
  :meth:`DatasetView.clone_frame_field() <fiftyone.core.view.DatasetView.clone_frame_field>`
  methods that allow cloning views into sample fields (e.g., after filtering
  the labels in a list field)
- Added a :meth:`DatasetView.clone() <fiftyone.core.view.DatasetView.clone>`
  method for cloning a view as a new dataset
- Added a :meth:`DatasetView.save() <fiftyone.core.view.DatasetView.save>`
  method for saving a view, overwriting the contents of the underlying dataset
- Re-implemented
  :meth:`Dataset.clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`
  and
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`
  via efficient DB-only operations
- Added the `overwrite` keyword argument to the
  :class:`Dataset() <fiftyone.core.dataset.Dataset>` constructor
- Added a ``database_dir`` option to the
  :ref:`FiftyOne Config <configuring-fiftyone>`
- Added a ``default_app_port`` option to the
  :ref:`FiftyOne Config <configuring-fiftyone>`

Zoo

- Added a :ref:`CenterNet model <model-zoo-centernet-hg104-512-coco-tf2>` to
  the model zoo
- Upgraded the :ref:`Model Zoo <model-zoo>` so that many detection models that
  previously required TensorFlow 1.X can now be used with TensorFlow 2.X
- Added :ref:`Caltech-256 <dataset-zoo-caltech256>` to the dataset zoo
- Added :ref:`ImageNet Sample <dataset-zoo-imagenet-sample>` to the dataset zoo
- :ref:`Caltech-101 <dataset-zoo-caltech101>` is now available natively in the
  dataset zoo without the TF backend
- :ref:`KITTI <dataset-zoo-kitti>` is now available natively in the dataset zoo
  without the TF backend
- Fixed a bug that prevented :ref:`ImageNet 2012 <dataset-zoo-imagenet-2012>`
  from loading properly when using the TF backend

CLI

- Added support for controlling the error level when
  :ref:`applying zoo models <cli-fiftyone-zoo-models-apply>`

Docs

- Added a :ref:`Dataset Zoo listing <dataset-zoo-datasets>` that describes all
  datasets in the zoo
- Added a :ref:`Model Zoo listing <model-zoo-models>` that describes all models
  in the zoo

.. _release-notes-v0.7.0:

FiftyOne 0.7.0
--------------
*Released December 21, 2020*

App

- Added web browser support, which is now the default settting
- Added :ref:`IPython notebook support <notebooks>`, e.g. Jupyter and Google
  Colab
- The desktop App can now be installed as an
  :ref:`optional dependency <installing-fiftyone-desktop>`
- Fixed an issue where the App would freeze after filtering labels in the
  Filters Sidebar

Core

- Added a :ref:`Model Zoo <model-zoo>` containing over 70 pretrained detection,
  classification, and segmentation models that you can use to generate
  predictions and embeddings
- Moved project hosting to `pypi.org <https://pypi.org/project/fiftyone/>`_
- Added the :meth:`Session.show() <fiftyone.core.session.Session.show>` method
  for displaying the App in IPython notebook cells
- Added an in-App feedback form. We would love to hear from you!
- Added Python 3.9 support
- Removed Python 3.5 support

CLI

- Added a :ref:`fiftyone zoo models <cli-fiftyone-zoo-models>` command that
  provides access to the model zoo
- Moved the dataset zoo commands to
  :ref:`fiftyone zoo datasets <cli-fiftyone-zoo-datasets>` (previously they
  were at ``fiftyone zoo``)
- Added a ``--desktop`` flag to commands that launch the App that enables
  launching the App as a desktop App (rather than a web browser)

.. _release-notes-v0.6.6:

FiftyOne 0.6.6
--------------
*Released November 25, 2020*

App

- Added a dropdown in the header to change datasets from the App
- Added the ability to refresh the App by clicking the FiftyOne logo in the
  header
- Fixed a bug the caused numeric (scalar field) range sliders to disappear
  after changing the default value
- Fixed a bug that prevented the App state from updating appropriately after
  applying label filters

Brain

- Added support for computing mistakenness for detections when using
  :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`

Core

- Fixed a bug that prevented COCO datasets from being loaded from the
  :ref:`Dataset Zoo <dataset-zoo>`

CLI

- Added support for customizing the local port when connecting to the App via
  the CLI
- Added an `--ssh-key` option to the `app connect` command

Docs

- Added :doc:`a tutorial </tutorials/detection_mistakes>` demonstrating how to
  use :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>` to
  detect label mistakes for detection datasets
- Added questions to the :ref:`FAQ page <faq>`:
   - :ref:`Can I launch multiple App instances on a machine? <faq-multiple-apps>`
   - :ref:`Can I connect multiple App instances to the same dataset? <faq-multiple-sessions-same-dataset>`
   - :ref:`Can I connect to multiple remote sessions? <faq-connect-to-multiple-remote-sessions>`
   - :ref:`Can I serve multiple remote sessions from a machine? <faq-serve-multiple-remote-sessions>`

.. _release-notes-v0.6.5:

FiftyOne 0.6.5
--------------
*Released November 16, 2020*

App

- Added concurrency to the server wich greatly improves loading speeds and
  time-to-interaction in the Grid, View Bar, and Filters Sidebar for larger
  datasets and views
- Renamed the Display Options Sidebar to the Filters Sidebar
- Added support for coloring by `label` value in the Filters Sidebar
- Added support for filtering
  :class:`keypoint <fiftyone.core.labels.Keypoint>`,
  :class:`keypoints <fiftyone.core.labels.Keypoints>`,
  :class:`polyline <fiftyone.core.labels.Polyline>`,
  :class:`polylines <fiftyone.core.labels.Polylines>` fields by `label` value
  in the Filters Sidebar
- Moved plot tabs into an expandable window that can be resized and maximized.
  This allows for viewing distributions and the sample grid at the same time
- Fixed video loading in the grid and modal for video samples with metadata
- Fixed showing and hiding samples in the select sample menu
- Fixed a memory usage bug in the sample grid

Core

- Added `Cityscapes <https://www.cityscapes-dataset.com/>`_ and
  `LFW <http://vis-www.cs.umass.edu/lfw>`_ to the
  :ref:`Dataset Zoo <dataset-zoo>`
- Added support for renaming and deleting embedded document fields of samples
  via :meth:`Dataset.rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>` and
  :meth:`Dataset.delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`
- Added support for renaming and deleting embedded document fields of frames
  of video samples via :meth:`Dataset.rename_frame_field() <fiftyone.core.dataset.Dataset.rename_frame_field>` and
  :meth:`Dataset.delete_frame_field() <fiftyone.core.dataset.Dataset.delete_frame_field>`
- Added support for deleting fields and embedded fields of individual samples
  via :meth:`Sample.clear_field() <fiftyone.core.sample.Sample.clear_field>`
  and :meth:`del sample[field_name] <fiftyone.core.sample.Sample.__delitem__>`
- Added support for deleting fields and embedded fields of frame labels via
  :meth:`Frame.clear_field() <fiftyone.core.frame.Frame.clear_field>`
  and :meth:`del frame[field_name] <fiftyone.core.frame.Frame.__delitem__>`
- Added support for reading/writing video datasets in JSON format via
  :meth:`Dataset.from_json() <fiftyone.core.dataset.Dataset.from_json>` and
  :meth:`SampleCollection.write_json() <fiftyone.core.collections.SampleCollection.write_json>`,
  respectively
- Added :mod:`a module <fiftyone.utils.scale>` for importing and exporting
  annotations from `Scale AI <https://scale.com>`_
- Added :mod:`a module <fiftyone.utils.labelbox>` for importing and exporting
  annotations from `Labelbox <https://labelbox.com>`_
- Fixed a bug that prevented
  :meth:`Dataset.add_sample() <fiftyone.core.dataset.Dataset.add_sample>` and
  :meth:`Dataset.add_samples() <fiftyone.core.dataset.Dataset.add_samples>`
  from working properly when provided samples that belong to other sample
  collections
- Fixed a bug that prevented frame labels from being properly cloned when
  calling :meth:`Dataset.clone() <fiftyone.core.dataset.Dataset.clone>` on
  video datasets

Docs

- Added an :ref:`Environments page <environments>` that outlines how
  to work with local, remote, and cloud data. Includes instructions for AWS,
  Google Cloud, and Azure
- Add an :ref:`FAQ page <faq>`

.. _release-notes-v0.6.4:

FiftyOne 0.6.4
--------------
*Released October 29, 2020*

App

- Improved page load times for video datasets
- Improved support for frame- and sample-level labels in display options for
  video datasets
- Added support for all label types in the labels distributions tab
- Added support for selecting and hiding labels in the sample modal

Brain

- Added support for computing uniqueness within regions-of-interest specified
  by a set of detections/polylines when using
  :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`

Core

- Added the
  :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
  view stage, which supercedes the old dedicated per-label-type filtering
  stages
- Added
  :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`
  and
  :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
  to select or exclude labels from a dataset or view
- Added an :mod:`aggregations framework <fiftyone.core.aggregations>` for
  computing aggregate values via
  :meth:`aggregate() <fiftyone.core.collections.SampleCollection.aggregate>`
- Added the
  :attr:`selected_labels <fiftyone.core.session.Session.selected_labels>`
  session attribute, which holds the currently selected labels in the App
- Added support for
  :meth:`adding <fiftyone.core.dataset.Dataset.add_frame_field>`,
  :meth:`renaming <fiftyone.core.dataset.Dataset.rename_frame_field>`, and
  :meth:`deleting <fiftyone.core.dataset.Dataset.delete_frame_field>`
  frame-level fields of video datasets
- Added the
  :class:`TorchImagePatchesDataset <fiftyone.utils.torch.TorchImagePatchesDataset>`
  that emits tensors of patches extracted from images defined by sets of
  :class:`Detections <fiftyone.core.labels.Detections>` associated with the
  images

.. _release-notes-v0.6.3:

FiftyOne 0.6.3
--------------
*Released October 20, 2020*

App

- Added sample-level display options stats, filtering, and toggling for video
  datasets

Core

- Added support for :ref:`importing <VideoClassificationDirectoryTree-import>`
  and :ref:`exporting <VideoClassificationDirectoryTree-export>` video
  classification datasets organized as directory trees on disk
- Added `BDD100K <https://bdd-data.berkeley.edu>`_,
  `HMDB51 <https://serre-lab.clps.brown.edu/resource/hmdb-a-large-human-motion-database>`_,
  and `UCF101 <https://www.crcv.ucf.edu/research/data-sets/ucf101>`_ to
  the :ref:`Dataset Zoo <dataset-zoo>`
- Added new versions of `COCO <https://cocodataset.org/#home>`_ that contain
  instance segmentations to the :ref:`Dataset Zoo <dataset-zoo>`
- Added utilities for selecting labels from datasets via the Python library
- Added a boolean `only_matches` parameter to all filter stages that enables
  the user to specify that a view should only contain samples that match the
  given filter
- Improved performance when ingesting video datasets with frame-level labels
- Added a :meth:`reencode_videos() <fiftyone.utils.video.reencode_videos>`
  utility to re-encode the videos in a sample collection so that they are
  visualizable in the FiftyOne App

.. _release-notes-v0.6.2:

FiftyOne 0.6.2
--------------
*Released October 15, 2020*

App

- Improved page and grid load times for video datasets by around 10x
- Added filtering, toggling, and statistics for labels with respect to the
  frame schema in the display options sidebars for video datasets
- Added margins to the grid view for both image and video datasets
- Fixed list parameter input submission in the view bar
- Fixed an issue causing some label counts to be incorrect after filters are
  applied
- Added support for using the keyboard to select labels when filtering

Brain

- :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>` and
  :meth:`compute_hardness() <fiftyone.brain.compute_hardness>` now support
  multilabel classification tasks

Core

- |Polyline| instances can now represent labels composed of multiple shapes
- Segmentations can now be :ref:`imported <COCODetectionDataset-import>` and
  :ref:`exported <COCODetectionDataset-export>` when using
  `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.
- Polylines and keypoints can now be :ref:`imported <CVATImageDataset-import>` and
  :ref:`exported <CVATImageDataset-export>` when using
  `CVAT image format <https://github.com/openvinotoolkit/cvat/blob/develop/cvat/apps/documentation/xml_format.md>`_
- Polylines and keypoints can now be :ref:`imported <CVATVideoDataset-import>` and
  :ref:`exported <CVATVideoDataset-export>` when using
  `CVAT video format <https://github.com/openvinotoolkit/cvat/blob/develop/cvat/apps/documentation/xml_format.md>`_
- Added support for rendering annotated versions of video samples with their
  frame labels overlaid via
  :meth:`draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
- Added support for :ref:`launching quickstarts <cli-fiftyone-quickstart>` as
  remote sessions
- Added :meth:`Frames.update() <fiftyone.core.frame.Frames.update>` and
  :meth:`Frames.merge() <fiftyone.core.frame.Frames.merge>` methods to replace
  and merge video frames, respectively
- Fixed :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`
  to properly merge the frame-by-frame contents of video samples
- Fixed a bug where :meth:`sample.copy() <fiftyone.core.sample.Sample.copy>`
  would not create a copy of the frames of a video sample

.. _release-notes-v0.6.1:

FiftyOne 0.6.1
--------------
*Released October 7, 2020*

App

- Added support for visualizing keypoints, polylines, and segmentation masks
- Added autocompletion when selecting `SortBy` fields in the view bar
- Added support for viewing `index` fields of |Detection| labels in the media
  viewer, if present
- Fixed counting of |Classifications| fields in the expanded sample view
- Fixed a bug that prevented label filters from fully resetting when a `reset`
  or `clear` button is pressed

Core

- Added support for storing :class:`keypoints <fiftyone.core.labels.Keypoint>`,
  :class:`polylines <fiftyone.core.labels.Polyline>`, and
  :class:`segmentation masks <fiftyone.core.labels.Segmentation>` on samples
- Added support for setting an `index` attribute on |Detection| instances that
  defines a unique identifier for an object (e.g., across frames of a video)
- Added support for :ref:`importing <YOLOv4Dataset-import>` and
  :ref:`exporting <YOLOv4Dataset-export>` datasets in
  `YOLOv4 format <https://github.com/AlexeyAB/darknet>`_
- Added support for :ref:`importing <CVATVideoDataset-import>` and
  :ref:`exporting <CVATVideoDataset-export>` datasets in
  `CVAT video format <https://github.com/openvinotoolkit/cvat/blob/develop/cvat/apps/documentation/xml_format.md>`_
- Added support for :ref:`importing <FiftyOneDataset-import>` and
  :ref:`exporting <FiftyOneDataset-export>` video datasets in
  :class:`FiftyOneDataset <fiftyone.types.FiftyOneDataset>` format
- Added frame field schemas to string representations for video datasets/views

CLI

- Added options to
  :ref:`fiftyone datasets delete <cli-fiftyone-datasets-delete>` to delete all
  datasets matching a pattern and all non-persistent datasets

Docs

- Added a recipe for :doc:`merging datasets </recipes/merge_datasets>`
- Fixed some table widths and other display issues

.. _release-notes-v0.6.0:

FiftyOne 0.6.0
--------------
*Released October 1, 2020*

App

- Added support for visualizing video datasets in the App

Core

- Added support for :ref:`storing frame labels <video-datasets>` on video
  samples
- Added support for :ref:`importing <VideoDirectory-import>` and
  :ref:`exporting <VideoDirectory-export>` datasets of unlabeled videos
- Added support for :ref:`importing <FiftyOneVideoLabelsDataset-import>` and
  :ref:`exporting <FiftyOneVideoLabelsDataset-export>` labeled video
  datasets in
  `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.
- Added support for :ref:`importing <writing-a-custom-dataset-importer>` and
  :ref:`exporting <writing-a-custom-dataset-exporter>` video datasets in
  custom formats
- Improved the performance of
  :meth:`Dataset.rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>`
- Added support for using disk space when running aggregation pipelines on
  large datasets
- Added support for automatically creating database indexes when sorting by
  sample fields, for efficiency
- Fixed issues with serializing vector fields and numpy arrays

.. _release-notes-v0.5.6:

FiftyOne 0.5.6
--------------
*Released September 23, 2020*

App

- Added autocompletion to view bar stage fields that accept field names (for
  example, :class:`Exists <fiftyone.core.stages.Exists>`)
- Fixed an issue that would prevent datasets with no numeric labels or scalars
  from loading in the App
- Fixed an error that could occur when a view included no samples
- Added notifications in the App that are displayed if errors occur on the
  backend
- Improved keyboard navigation between view bar stages

Core

- Added support for loading (possibly-randomized) subsets of datasets when
  importing them via |DatasetImporter| instances, or via factory methods such
  as :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>`
- Added support for optionally skipping unlabeled images when importing image
  datasets via |LabeledImageDatasetImporter| instances
- Added a
  :meth:`Dataset.merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`
  method for merging samples in datasets via joining by ``filepath``
- Added a
  :meth:`Dataset.rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>`
  method for renaming sample fields of datasets

.. _release-notes-v0.5.5:

FiftyOne 0.5.5
--------------
*Released September 15, 2020*

App

- Added support for filtering samples by numeric fields in the sidebar
- Confidence bounds are now computed for the confidence slider in the label
  filter - a `[0, 1]` range is no longer assumed
- Fixed an issue that would cause certain stages to be reevaluated when the view
  bar was edited
- Improved responsiveness when adding stages in the view bar, filtering, and
  selecting samples
- Simplified placeholders in the view bar
- Added support for filtering sample JSON in the expanded sample view to match
  the labels displayed in the media viewer
- Updated the instructions that appear when starting the App before connecting
  to a session

Core

- Added support for :meth:`Session.wait() <fiftyone.core.session.Session.wait>`
  for remote sessions, to make starting a remote session from a script easier

.. _release-notes-v0.5.4:

FiftyOne 0.5.4
--------------
*Released September 9, 2020*

App

- Added support for selecting/excluding samples from the current view in the
  App by selecting them and then choosing the appropriate option from a sample
  selection menu
- Added autocomplete when creating new stages in the view bar
- Updated the look-and-feel of the view bar to clarify when a stage and/or the
  entire view bar are active, and to make the bar more visually consistent with
  the rest of the App
- Media viewer options are maintained while browsing between samples in
  expanded sample view
- Improved the look-and-feel of confidence sliders when filtering labels
- Limited floating point numbers to three decimals when rendering them in the
  media viewer
- Fixed some bugs related to content overflow in the view bar

Core

- Added support for exporting |Classification| labels in dataset formats that
  expect |Detections| labels
- Added support for importing/exporting supercategories for datasets in
  :ref:`COCO format <COCODetectionDataset-import>`

.. _release-notes-v0.5.3:

FiftyOne 0.5.3
--------------
*Released September 1, 2020*

App

- Added support for filtering labels in the expanded sample view
- Added support for displaying detection attributes in the expanded sample view
- Added an option to display confidence when viewing labels in the expanded
  sample view
- Updated look-and-feel of display options in the expanded sample view to match
  the main image grid view
- Adopting a default color palette for sample fields in the App that ensures
  that they are visually distinct
- Fixed a bug that prevented the App from loading empty views
- Fixed a bug that prevented the view bar from using default values for some
  stage parameters

Core

- Added support for checking that a field *does not* exist via a new boolean
  parameter of the
  :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>`
  view stage
- Fixed a bug that prevented FiftyOne from starting for some Windows users
- Fixed a bug that caused
  :meth:`take() <fiftyone.core.collections.SampleCollection.take>` and
  :meth:`shuffle() <fiftyone.core.collections.SampleCollection.shuffle>` view
  stages with random seeds to be regenerated when handing off between the App
  and Python shell

.. _release-notes-v0.5.2:

FiftyOne 0.5.2
--------------
*Released August 26, 2020*

App

- Added a label filter to the App that allows you to interactively explore your
  labels, investigating things like confidence thresholds, individual classes,
  and more, directly from the App
- Added an App error page with support for refreshing the App if something goes
  wrong
- The App can now be closed and reopened within the same session

Core

- Added a :ref:`fiftyone quickstart <cli-fiftyone-quickstart>` command that
  downloads a small dataset, launches the App, and prints some suggestions for
  exploring the dataset
- Added support for multiple simultaneous FiftyOne processes. You can now
  operate multiple App instances (using different ports), Python shells, and/or
  CLI processes.
- Added support for automatically expanding labels from multitask formats such
  as :ref:`BDDDataset <BDDDataset-import>` and
  :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-import>` into
  separate label fields when importing datasets
- Added support for exporting multiple label fields in supported formats such
  as :ref:`BDDDataset <BDDDataset-export>` and
  :ref:`FiftyOneImageLabelsDataset <FiftyOneImageLabelsDataset-export>`
  via the :meth:`export() <fiftyone.core.collections.SampleCollection.export>`
  method
- Added support for filtering fields via the
  :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
  method
- Provided a more helpful error message when using the
  :ref:`Dataset Zoo <dataset-zoo>` with no backend ML framework installed
- Made ``pycocotools`` an optional dependency to make installation on Windows
  easier

Docs

- Updated the :doc:`evaluate object detections </tutorials/evaluate_detections>`
  tutorial to make it more friendly for execution on CPU-only machines
- Refreshed all App-related media in the docs to reflect the new App design
  introduced in v0.5.0

.. _release-notes-v0.5.1:

FiftyOne 0.5.1
--------------
*Released August 18, 2020*

App

- Statistics in the display options sidebar now reflect the current
  :ref:`view <using-views>`, not the entire :ref:`dataset <using-datasets>`
- Improved image tiling algorithm that prevents single images from filling an
  entire grid row
- Added support for toggling label visibility within the expanded sample modal
- Improved display of long label and tag names throughout the app
- Enhanced view bar functionality, including keyword arguments, type
  annotations, error messages, help links, and overall stability improvements
- Added keyboard shortcuts for interacting with the view bar:
   - `DEL` and `BACKSPACE` delete the raised (active) stage
   - `ESC` toggles focus on the ViewBar, which activates shortcuts
   - `TAB`, `ENTER`, and `ESC` submits stage input fields
   - `LEFT` and `RIGHT ARROW` traverses view stages and add-stage buttons
   - `SHIFT + LEFT ARROW` and `SHIFT + RIGHT ARROW` traverse stages

Core

- Greatly improved the performance of loading dataset samples from the database
- Added support for :meth:`renaming <fiftyone.core.dataset.Dataset.name>` and
  :meth:`cloning <fiftyone.core.dataset.Dataset.clone>` datasets
- Added more string matching operations when
  :ref:`querying samples <querying-samples>`, including
  :meth:`starts_with() <fiftyone.core.expressions.ViewExpression.starts_with>`,
  :meth:`ends_with() <fiftyone.core.expressions.ViewExpression.ends_with>`,
  :meth:`contains_str() <fiftyone.core.expressions.ViewExpression.contains_str>` and
  :meth:`matches_str() <fiftyone.core.expressions.ViewExpression.matches_str>`

Docs

- Added a tutorial demonstrating performing error analysis on the
  `Open Images Dataset <https://storage.googleapis.com/openimages/web/index.html>`_
  powered by FiftyOne

.. _release-notes-v0.5.0:

FiftyOne 0.5.0
--------------
*Released August 11, 2020*

News

- FiftyOne is now open source! Read more about this exciting development
  `in this press release <https://voxel51.com/press/fiftyone-open-source-launch>`_

App

- Major design refresh, including a
  `new look-and-feel for the App <https://voxel51.com/docs/fiftyone/_static/images/release-notes/v050_release_app.png>`_
- Added view bar that supports constructing dataset views directly in the App
- Redesigned expanded sample view:
    - Improved look-and-feel, with modal-style form factor
    - Added support for maximizing the media player
    - Added support for maximizing the raw sample view
    - Added arrow controls to navigate between samples

Core

- Added support for :ref:`importing <FiftyOneDataset-import>` and
  :ref:`exporting <FiftyOneDataset-export>` FiftyOne datasets via the
  :class:`FiftyOneDataset <fiftyone.types.FiftyOneDataset>` type
- Added a :meth:`Dataset.info <fiftyone.core.dataset.Dataset.info>` field that
  can be used to store dataset-level info in FiftyOne datasets
- Added a :meth:`shuffle() <fiftyone.core.collections.SampleCollection.shuffle>`
  view stage for randomly shuffling the samples in a dataset
- Upgraded the :meth:`take() <fiftyone.core.collections.SampleCollection.take>`
  view stage so that each instance of a view maintains a deterministic set of
  samples

.. _release-notes-v0.4.1:

FiftyOne 0.4.1
--------------
*Released August 4, 2020*

Core

- Added a powerful :mod:`fiftyone.core.expressions` module for constructing
  complex DatasetView :meth:`match() <fiftyone.core.collections.SampleCollection.match>`,
  :meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`, etc.
  stages
- Added an
  :meth:`evaluate_detections() <fiftyone.utils.eval.coco.evaluate_detections>`
  utility for evaluating object detections in FiftyOne datasets
- Adding support for rendering annotated versions of sample data with their
  labels overlaid via a
  :meth:`draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
  method

Docs

- Added :doc:`a tutorial </tutorials/evaluate_detections>` demonstrating
  object detection evaluation workflows powered by FiftyOne
- Added :doc:`full documentation </user_guide/using_views>` for constructing
  DatasetViews with powerful matching, filtering, and sorting operations
- Added :doc:`a recipe </recipes/draw_labels>` showing how to render annotated
  versions of samples with label field(s) overlaid
- Upgraded :doc:`dataset creation docs </user_guide/dataset_creation/index>`
  that simplify the material and make it easier to find the creation strategy
  of interest
- Improved layout of :doc:`tutorials </tutorials/index>`,
  :doc:`recipes </recipes/index>`, and :doc:`user guide </user_guide/index>`
  landing pages

.. _release-notes-v0.4.0:

FiftyOne 0.4.0
--------------
*Released July 21, 2020*

App

- Fixed an issue that could cause launching the App to fail on Windows under
  Python 3.6 and older

Core

- Added support for importing datasets in custom formats via the
  |DatasetImporter| interface
- Added support for exporting datasets to disk in custom formats via the
  |DatasetExporter| interface
- Added support for parsing individual elements of samples in the
  |SampleParser| interface
- Added an option to image loaders in :mod:`fiftyone.utils.torch` to convert
  images to RGB
- Fixed an issue where
  :meth:`Dataset.delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`
  would not permanently delete fields if they were modified after deletion
- Improved the string representation of |ViewStage| instances

Docs

- Added a recipe demonstrating how to
  :doc:`convert datasets </recipes/convert_datasets>` on disk between common
  formats
- Added recipes demonstratings how to write your own
  :doc:`custom dataset importers </recipes/custom_importer>`,
  :doc:`custom dataset exporters </recipes/custom_exporter>`, and
  :doc:`custom sample parsers </recipes/custom_parser>`
- Added a :doc:`Configuring FiftyOne </user_guide/config>` page to the User
  Guide that explains how to customize your FiftyOne Config

.. _release-notes-v0.3.0:

FiftyOne 0.3.0
--------------
*Released June 24, 2020*

App

- Fixed an issue that could prevent the App from connecting to the FiftyOne
  backend

Core

- Added support for importing and exporting datasets in several common formats:
    - COCO: :class:`COCODetectionDataset <fiftyone.types.COCODetectionDataset>`
    - VOC: :class:`VOCDetectionDataset <fiftyone.types.VOCDetectionDataset>`
    - KITTI: :class:`KITTIDetectionDataset <fiftyone.types.KITTIDetectionDataset>`
    - Image classification TFRecords:
      :class:`TFImageClassificationDataset <fiftyone.types.TFImageClassificationDataset>`
    - TF Object Detection API TFRecords:
      :class:`TFObjectDetectionDataset <fiftyone.types.TFObjectDetectionDataset>`
    - CVAT image: :class:`CVATImageDataset <fiftyone.types.CVATImageDataset>`
    - Berkeley DeepDrive: :class:`BDDDataset <fiftyone.types.BDDDataset>`
- Added :meth:`Dataset.add_dir() <fiftyone.core.dataset.Dataset.add_dir>` and
  :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to allow
  for importing datasets on disk in any supported format
- Added a :meth:`convert_dataset() <fiftyone.utils.data.converters.convert_dataset>`
  method to convert between supported dataset formats
- Added support for downloading COCO 2014/2017 through the FiftyOne Dataset Zoo
  via the Torch backend

CLI

- Added `fiftyone convert` to convert datasets on disk between any supported
  formats
- Added `fiftyone datasets head` and `fiftyone datasets tail` to print the
  head/tail of datasets
- Added `fiftyone datasets stream` to stream the samples in a dataset to the
  terminal with a `less`-like interface
- Added `fiftyone datasets export` to export datasets in any available format

.. _release-notes-v0.2.1:

FiftyOne 0.2.1
--------------
*Released June 19, 2020*

Core

- Added preliminary Windows support
- :meth:`Dataset.add_images_dir() <fiftyone.core.dataset.Dataset.add_images_dir>`
  now skips non-images
- Improved performance of adding samples to datasets

CLI

- Fixed an issue that could cause port forwarding to hang when initializing a
  remote session

.. _release-notes-v0.2.0:

FiftyOne 0.2.0
--------------
*Released June 12, 2020*

App

- Added distribution graphs for label fields
- Fixed an issue causing cached images from previously-loaded datasets to be
  displayed after loading a new dataset

Core

- Added support for persistent datasets
- Added a class-based view stage approach via the |ViewStage| interface
- Added support for serializing collections as JSON and reading datasets from
  JSON
- Added support for storing numpy arrays in samples
- Added a config option to control visibility of progress bars
- Added progress reporting to
  :meth:`Dataset.add_samples() <fiftyone.core.dataset.Dataset.add_samples>`
- Added a :meth:`SampleCollection.compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`
  method to enable population of the `metadata` fields of samples
- Improved reliability of shutting down the App and database services
- Improved string representations of |Dataset| and |Sample| objects

CLI

- Added support for creating datasets and launching the App
