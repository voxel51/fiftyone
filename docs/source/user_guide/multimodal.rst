.. _fiftyone-multimodal:

FiftyOne Multimodal
===================

.. default-role:: code

FiftyOne provides native support for **multimodal datasets**, which represent
rich, time-synchronized sensor recordings such as robotics and autonomous
vehicle logs stored in the `MCAP <https://mcap.dev>`_ container format.

A single multimodal sample can contain many concurrent data streams — camera
images, LIDAR point clouds, IMU readings, GPS fixes, coordinate frame
transforms, diagnostics, and more — and FiftyOne lets you visualize, play
back, tag, and query all of them in lockstep.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/mcap-playback.webp
   :alt: multimodal-playback
   :align: center

.. note::

    Multimodal visualization is available to all FiftyOne users. With
    :ref:`FiftyOne Enterprise <fiftyone-enterprise>` you can additionally
    :ref:`index your MCAP data <multimodal-indexing>` (currently in beta)
    into columnar tables that power scalable search, filtering, and event
    mining across your entire fleet of recordings.

.. _multimodal-overview:

Overview
________

A multimodal dataset is a FiftyOne dataset whose samples point to `.mcap`
files. MCAP is a self-describing container format for heterogeneous,
timestamped robotics data that stores *messages* organized into *channels*
(topics), each with an associated *schema* describing how to decode its
payloads.

When you add samples whose filepaths end in `.mcap`, the dataset's media type
is automatically inferred as `"multimodal"`:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset("driving-logs")
    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/episode-0001.mcap"),
            fo.Sample(filepath="/path/to/episode-0002.mcap"),
        ]
    )

    print(dataset.media_type)  # multimodal

When you open a multimodal sample in the App, FiftyOne reads the MCAP file
directly via efficient byte-range reads — no server-side conversion is
required — discovers its channels and schemas, decodes the messages it knows
how to interpret, and renders them in a configurable, tiled viewer with a
shared playback clock.

Key concepts:

-   **Episodes**: each sample in a multimodal dataset is an episode — one
    MCAP recording
-   **Streams**: each MCAP channel (topic) becomes a stream that can be bound
    to one or more tiles in the viewer
-   **Time tracks**: every message carries timestamps (log time, publish
    time, or a decoded header stamp) that drive synchronized playback across
    all tiles

.. _multimodal-grid-previews:

Grid previews
_____________

In the App's sample grid, each multimodal sample displays a preview rendered
from one of its streams, and you can use the stream selector to choose which
stream is used for grid previews.

.. Placeholder: gif showing grid previews + stream selector
.. .. image:: /images/multimodal/multimodal-grid.gif
..    :alt: multimodal-grid
..    :align: center

.. _multimodal-tiles:

Tiles
_____

Multimodal samples open in a configurable, mosaic-style viewer composed of
**tiles**. You can add, remove, resize, and rearrange tiles, and bind each
tile to any compatible stream in the recording. All tiles share a common
playback clock, so scrubbing the timeline updates every tile in sync.

.. Placeholder: gif showing the tiled viewer layout + timeline scrubbing
.. .. image:: /images/multimodal/multimodal-viewer.gif
..    :alt: multimodal-viewer
..    :align: center

.. _multimodal-image-tile:

Image tile
----------

Image tiles render camera streams, including raw and compressed images from
ROS and Foxglove schemas as well as compressed video streams (currently
H.264). Image annotations (e.g. `foxglove.ImageAnnotations`) can be overlaid
on their corresponding camera stream, and when camera calibration data is
available, hovering over an image tile highlights that camera's frustum in
the 3D tile.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/image-panel.webp
   :alt: multimodal-image-tile
   :align: center

.. _multimodal-3d-tile:

3D tile
-------

The 3D tile renders the spatial content of your recording in a shared world
frame: point clouds (with configurable colormaps and color-by fields such as
intensity), laser scans, occupancy grids, scene-update primitives, pose
trajectories, and camera frustums. Coordinate frame transforms from the
recording are used to place everything correctly, and you can select the
reference frame, track a moving frame with the camera, measure distances, and
inspect points via hover tooltips.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/3d-panel.webp
   :alt: multimodal-3d-tile
   :align: center

.. _multimodal-map-tile:

Map tile
--------

The map tile plots GNSS location streams (e.g. `foxglove.LocationFix` or
`sensor_msgs/msg/NavSatFix`) as tracks on an interactive map. The current
position follows the playback clock, and you can hover to inspect points
along the track and measure distances between locations.

.. Placeholder: recording of the map tile
.. .. image:: /images/multimodal/multimodal-map-tile.webp
..    :alt: multimodal-map-tile
..    :align: center

.. _multimodal-logs-tile:

Logs tile
---------

The logs tile is a console view for log topics (`foxglove.Log`,
`rcl_interfaces/msg/Log`, `rosgraph_msgs/Log`). Log entries scroll in sync
with the playback clock, and you can pause following to scan the history or
seek the recording to an entry of interest.

.. Placeholder: recording of the logs tile
.. .. image:: /images/multimodal/multimodal-logs-tile.webp
..    :alt: multimodal-logs-tile
..    :align: center

.. _multimodal-plot-tile:

Plot tile
---------

Plot tiles chart numeric series extracted from any topic and field path in
the recording — IMU rates, vehicle speed, steering angle, diagnostics values,
etc. — over the full duration of the recording. A playhead marks the current
playback position, and clicking anywhere in the plot seeks the shared clock
to that time.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/plot-panel.webp
   :alt: multimodal-plot-tile
   :align: center

.. _multimodal-message-tile:

Message tile
------------

The message tile is the escape hatch for any channel, decoded or not: it
displays the most recent message on a selected topic at the current playhead
as a collapsible record tree, so you can inspect exact field values as you
scrub through the recording.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/message-panel.webp
   :alt: multimodal-message-tile
   :align: center

.. _multimodal-settings-sidebar:

Configuring tiles
-----------------

To add a new tile to the viewer, click the **Add tile** button (the grid
icon) in the viewer's header and choose the tile type you want — Image, 3D,
Map, Logs, Plot, or Message. The same menu also offers **Auto Layout**,
which automatically arranges your tiles.

The **left sidebar** of the viewer is where you configure what each
tile is showing. It contains the following tabs:

-   **Scene**: settings that apply to the whole recording:

    -   **Playback**: choose how signals behave between recorded samples —
        `Smooth` interpolates continuous signals (transforms and 2D/3D label
        geometry) for fluid playback, while `As recorded` never synthesizes
        values and holds each signal at its latest recorded sample
    -   **Advanced timing**: fine-grained control over how messages are
        matched to the playback clock

-   **Topics**: a searchable inventory of every topic in the recording,
    grouped by category (Sensors, Annotations & Planning, Transforms &
    Poses, Diagnostics, Telemetry, and Custom/Unknown). Each topic shows
    how it can be visualized, and you can open a topic directly in a
    compatible tile from here

-   **Tile settings**: when you focus a tile, a tab named for that
    tile appears with its specific options — for example, which streams and
    overlays an image tile displays, the 3D tile's colormaps and camera
    behavior, the topic/field series charted by a plot tile, or the topic
    shown in a message tile

.. Placeholder: gif showing the left settings sidebar (scene + tile tabs)
.. .. image:: /images/multimodal/multimodal-settings-sidebar.gif
..    :alt: multimodal-settings-sidebar
..    :align: center

.. _multimodal-inspector-sidebar:

Inspecting objects
------------------

The **right sidebar** of the viewer is an inspector for objects in the
scene. Click any object in any tile — a 3D box in the 3D tile or an
annotation in an image tile — to view its details:

-   For 3D scene objects: the object's label, entity ID, topic, coordinate
    frame, and any metadata attached to the object
-   For image annotations: the object's label, primitive kind, topic, and
    exact geometry

Any fields not covered by the structured view are shown as raw JSON. Press
`Esc` or click `Clear selection` to clear the current selection.

.. Placeholder: gif showing the right inspector sidebar with a selected object
.. .. image:: /images/multimodal/multimodal-inspector-sidebar.gif
..    :alt: multimodal-inspector-sidebar
..    :align: center

.. _multimodal-mcap-explorer:

MCAP Explorer
_____________

FiftyOne also includes a standalone **MCAP Explorer** panel that lets you
open an arbitrary local `.mcap` file (via drag-and-drop or file browser) or a
remote URL without creating a dataset first. Local files stay in your browser
session and are read directly — nothing is uploaded.

.. Placeholder: gif showing the MCAP Explorer panel
.. .. image:: /images/multimodal/mcap-explorer.gif
..    :alt: mcap-explorer
..    :align: center

.. _multimodal-temporal-tags:

Temporal tags
_____________

Multimodal samples span long time ranges, so FiftyOne supports **temporal
tags**: tags attached to a time interval within a sample rather than to the
whole sample. Temporal tags are ideal for marking events of interest —
interventions, near-misses, sensor dropouts, interesting maneuvers.

You can create temporal tags interactively in the App, or programmatically
via the SDK.

Tagging in the App
------------------

To create a temporal tag in the App, **Shift + click and drag** along the
playback timeline to select the interval of interest, then enter the tag.
Existing tags appear on the timeline, where you can review and delete them.

.. image:: https://cdn.voxel51.com/fundamentals/fiftyone_multimodal/temporal-tag.webp
   :alt: multimodal-temporal-tags
   :align: center

Tagging via the SDK
-------------------

You can create and read temporal tags programmatically:

.. code-block:: python
    :linenos:

    import fiftyone.core.tags as fota

    sample = dataset.first()

    # Tag the interval [start, end) on a sample, expressed in nanoseconds
    # elapsed since the start of the recording
    dataset.temporal_tags.add(
        fota.TemporalTag(
            sample.id,
            start=4_000_000_000,  # 4s, inclusive
            end=6_000_000_000,  # 6s, exclusive
            tag="gripper closed",
        )
    )

    # Retrieve the collection's temporal tags
    print(dataset.temporal_tags)

You can also filter your dataset to samples whose temporal tags match given
criteria:

.. code-block:: python
    :linenos:

    # Samples containing at least one "gripper closed" temporal tag
    view = dataset.match_temporal_tags(tags="gripper closed")

.. _multimodal-schemas:

Supported schemas
_________________

FiftyOne ships with built-in decoders for the message schemas below. Any
channel whose schema is not recognized remains fully accessible via the
:ref:`Message tile <multimodal-message-tile>`, so you can always inspect
your data even before a dedicated decoder exists.

ROS
---

Both ROS 1 and ROS 2 messages are supported for the following schemas,
listed here in their ROS 2 form (the corresponding ROS 1 schemas are also
supported):

.. list-table::
    :widths: 40 60
    :header-rows: 1

    * - Schema
      - Description
    * - `sensor_msgs/msg/Image`
      - Raw camera images, including common pixel encodings (`rgb8`, `bgr8`,
        `rgba8`, `bgra8`, `mono8`, `mono16`) and Bayer-patterned formats
    * - `sensor_msgs/msg/CompressedImage`
      - Compressed (e.g. JPEG/PNG) camera images
    * - `sensor_msgs/msg/CameraInfo`
      - Camera intrinsics and distortion parameters, rendered as camera
        frustums in the 3D tile
    * - `sensor_msgs/msg/PointCloud2`
      - LIDAR and other point clouds, with support for per-point scalar
        fields such as intensity
    * - `sensor_msgs/msg/LaserScan`
      - Planar laser range scans
    * - `sensor_msgs/msg/NavSatFix`
      - GNSS position fixes, rendered in the map tile
    * - `nav_msgs/msg/Odometry`
      - Odometry poses with velocity/acceleration kinematics
    * - `nav_msgs/msg/Path`
      - Pose sequences such as planned or traveled paths
    * - `nav_msgs/msg/OccupancyGrid`
      - Occupancy grids, rendered as textured planes in 3D
    * - `geometry_msgs/msg/PoseStamped`
      - Single timestamped poses
    * - `geometry_msgs/msg/PoseArray`
      - Batches of poses
    * - `geometry_msgs/msg/TransformStamped`
      - Single coordinate frame transforms
    * - `tf2_msgs/msg/TFMessage`
      - Coordinate frame transforms that define the scene's frame graph
    * - `visualization_msgs/msg/Marker` /
        `visualization_msgs/msg/MarkerArray`
      - Scene markers (cubes, spheres, lines, text, meshes) rendered in the
        3D tile
    * - `vision_msgs/msg/Detection2DArray`
      - 2D detections overlaid on camera images
    * - `vision_msgs/msg/Detection3DArray`
      - 3D detections rendered in the 3D tile
    * - `diagnostic_msgs/msg/DiagnosticArray`
      - Diagnostics status arrays
    * - `rcl_interfaces/msg/Log`
      - Log messages (`rosgraph_msgs/Log` in ROS 1), shown in the logs tile

Foxglove
--------

All of the core `Foxglove schemas <https://docs.foxglove.dev/docs/sdk/schemas>`_
are supported, in both their protobuf and ROS (CDR) encodings:

.. list-table::
    :widths: 40 60
    :header-rows: 1

    * - Schema
      - Description
    * - `foxglove.Image`
      - Raw camera images
    * - `foxglove.CompressedImage`
      - Compressed camera images
    * - `foxglove.CompressedVideo`
      - Compressed video streams (currently H.264)
    * - `foxglove.ImageAnnotations`
      - 2D annotations (points, circles, text) overlaid on camera images
    * - `foxglove.CameraCalibration`
      - Camera intrinsics and distortion, rendered as camera frustums
    * - `foxglove.PointCloud`
      - Point clouds with per-field data
    * - `foxglove.LaserScan`
      - Planar laser range scans
    * - `foxglove.Grid`
      - 2D data grids (e.g. occupancy/cost maps), rendered as textured
        planes in 3D
    * - `foxglove.SceneUpdate`
      - Scene-graph primitives (arrows, cubes, spheres, lines, text, models)
    * - `foxglove.FrameTransform`
      - A single coordinate frame transform
    * - `foxglove.FrameTransforms`
      - A batch of coordinate frame transforms
    * - `foxglove.PoseInFrame`
      - SE(3) poses (translation + quaternion)
    * - `foxglove.LocationFix`
      - GNSS position fixes (latitude/longitude/altitude), rendered in the
        map tile
    * - `foxglove.Log`
      - Log messages, shown in the logs tile

JSON
----

Channels containing JSON-encoded messages are supported for the following
schemas:

.. list-table::
    :widths: 40 60
    :header-rows: 1

    * - Schema
      - Description
    * - `Pose`
      - JSON-encoded pose/odometry data
    * - JSON-encoded ROS schemas
      - JSON-encoded versions of the ROS schemas above (e.g.
        `sensor_msgs/PointCloud2`, `nav_msgs/Odometry`) are decoded just
        like their binary counterparts

.. _multimodal-indexing:

Indexing MCAP data __SUB_BETA__
_______________________________

.. note::

    MCAP indexing is only available in
    :ref:`FiftyOne Enterprise <fiftyone-enterprise>`. It is currently in
    **beta** and is disabled by default; contact your deployment
    administrator or Voxel51 support to enable the feature flag for your
    deployment.

    As we continue to refine the feature during the beta period, some of the
    APIs and manifest fields described below may evolve in future releases.
    We'll keep this page up to date as that happens.

MCAP files are optimized for recording and playback, not for analytical
queries. Questions like *"find every episode where a pedestrian was visible
while the vehicle was moving faster than 5 m/s"* would otherwise require
scanning and decoding every file in your fleet.

FiftyOne Enterprise solves this by **indexing** your MCAP data: a projection
pipeline reads each recording once, decodes the channels you declare, and
writes the results to columnar **Parquet** tables (managed via `Apache
Iceberg <https://iceberg.apache.org>`_) called **projections**. These tables
power fast, scalable filtering, aggregation, and event search across your
entire dataset — in the App's grid, sidebar, and query interfaces — without
ever re-reading the source MCAPs.

You control exactly what gets indexed by authoring a
:ref:`projection manifest <multimodal-manifests>`. Four kinds (*grains*) of
projections are supported:

-   **labels**: per-message rows extracted from annotation streams, e.g. the
    text and geometry of every image annotation
-   **signals**: numeric time series sampled from message fields, e.g.
    vehicle speed, steering angle, or IMU rates, with configurable sampling
    strategies
-   **events**: derived time intervals computed from other projections using
    :ref:`expressions <multimodal-expressions>`, e.g. "windows of high
    steering lasting at least 500ms"
-   **summaries**: per-episode scalar rollups, e.g. the max speed or whether
    any pedestrian was observed

Indexing runs as :ref:`delegated operations <delegated-operations>` that are
automatically scheduled and orchestrated across your deployment's compute.
Projection tables can be written to local storage or directly to cloud
buckets (`s3://`, `gs://`, `az://`).

Enabling indexing
-----------------

To index a multimodal dataset, configure it with a
:ref:`projection manifest <multimodal-manifests>` and enable projections:

.. code-block:: python
    :linenos:

    from fiftyone.multimodal import MultimodalDataset

    dataset = MultimodalDataset("driving-logs")
    dataset.add_samples(...)

    # Configure the dataset with your manifest and enable indexing
    with open("/path/to/manifest.yaml", "r") as f:
        dataset.projections.enable(f.read())

Indexing is then scheduled and executed automatically. You can check on its
progress, disable it, or retry a stuck run at any time:

.. code-block:: python
    :linenos:

    # The active run's status, including per-sample progress
    print(dataset.projections.get_projection().status())

    # Disable indexing, abandoning any active run
    dataset.projections.disable()

    # Reset a run that was interrupted (e.g. its worker crashed) so that it
    # is automatically requeued
    dataset.projections.retry()

.. _multimodal-manifests:

Authoring manifests __SUB_BETA__
________________________________

A **projection manifest** is a YAML document that tells the indexing system
what data to extract from your MCAP files and how to organize it. A manifest
has four top-level keys:

.. code-block:: yaml

    sink: ...                     # where projection tables are written
    channel_bindings: ...         # which MCAP channels to read
    channel_binding_repeats: ...  # templated bindings for repeated sensors
    projections: ...              # the tables to build from those channels

Sink
----

The `sink` section declares where projection tables are written. The
`location` may be a local path or a cloud bucket URI:

.. code-block:: yaml

    sink:
      type: iceberg  # the default
      location: s3://my-bucket/projections

Channel bindings
----------------

A **channel binding** selects a channel from your MCAP files and gives it a
stable `id` that projections can reference. Channels are selected by
`match`-ing on their topic, schema name, and encoding, and can optionally be
filtered with a `where` expression:

.. code-block:: yaml

    channel_bindings:
      - id: diagnostics_steering_angle
        match: { topic: /diagnostics, schema_name: Diagnostics, encoding: json }
        where: 'name == "Steering Angle"'
        timestamp_source:
          candidates:
            - mcap: MCAP_MESSAGE_TIME_LOG_TIME

Each binding supports the following fields:

-   `id`: a unique identifier for the binding
-   `match`: the channel selector, with keys `topic`, `schema_name`, and
    `encoding`
-   `where` (optional): an :ref:`expression <multimodal-expressions>` that
    filters messages within the channel, e.g. when multiple logical signals
    share a single topic
-   `timestamp_source`: an ordered list of `candidates` declaring where each
    message's timestamp comes from. Each candidate is either:

    -   `decoded: { path: <field.path> }`: a timestamp field decoded from
        the message payload
    -   `mcap: MCAP_MESSAGE_TIME_LOG_TIME` or
        `mcap: MCAP_MESSAGE_TIME_PUBLISH_TIME`: the MCAP record's log or
        publish time

Channel binding repeats
-----------------------

Multi-sensor rigs typically have many channels with identical structure
(e.g. six cameras). Rather than duplicating bindings, use
`channel_binding_repeats` to declare a template that is expanded once per
sensor using `{{var}}` substitution:

.. code-block:: yaml

    channel_binding_repeats:
      - var: camera
        values:
          - { stream_id: cam_front, topic: CAM_FRONT }
          - { stream_id: cam_back, topic: CAM_BACK }
        templates:
          - id: "{{camera.stream_id}}_annotations"
            match:
              {
                topic: "/{{camera.topic}}/annotations",
                schema_name: foxglove.ImageAnnotations,
                encoding: protobuf,
              }
            timestamp_source:
              candidates:
                - decoded: { path: timestamp }
                - mcap: MCAP_MESSAGE_TIME_LOG_TIME

The example above expands into two channel bindings,
`cam_front_annotations` and `cam_back_annotations`.

Projections
-----------

Each entry in `projections` declares one table. A projection names its
`sources` — the channel bindings (or previously-defined projections) it
reads from — and exactly one grain block (`labels`, `signals`, `events`, or
`summaries`) describing the rows and columns to produce.

**Labels** extract one row per message (or per exploded array element) from
annotation streams:

.. code-block:: yaml

    projections:
      - id: semantic_labels
        sources:
          - name: labels
            channel_bindings:
              - cam_front_annotations
              - cam_back_annotations
        labels:
          rows:
            for_each: labels
            explode: [texts, points]
            timestamp: labels.stream.timestamp
          columns:
            - { id: camera_id, value: labels.stream.id }
            - { id: label, value: labels.texts.text }
            - { id: image_points, value: labels.points.points }

**Signals** extract numeric time series. Columns may carry `quantity` and
`unit` metadata, and values may be computed with
:ref:`expressions <multimodal-expressions>`. The `sampling` block controls
how the series is materialized:

.. code-block:: yaml

    projections:
      - id: imu_signals
        sources:
          - name: imu
            channel_bindings:
              - imu
        signals:
          rows:
            for_each: imu
            timestamp: imu.stream.timestamp
          sampling:
            strategy: SIGNAL_SAMPLING_STRATEGY_WINDOW
            window_ns: "50000000"
            aggregations:
              - SIGNAL_AGGREGATION_MEAN
              - SIGNAL_AGGREGATION_MAX
          clustering_keys: [timestamp_ns]
          columns:
            - {
                id: angular_velocity_x,
                value: imu.rotation_rate.x,
                quantity: angular_velocity,
                unit: rad/s,
              }

The available sampling strategies are:

-   `SIGNAL_SAMPLING_STRATEGY_NATIVE`: one row per source message
-   `SIGNAL_SAMPLING_STRATEGY_WINDOW`: aggregate values over fixed windows
    of `window_ns` nanoseconds, applying each of the requested
    `aggregations` (`MEAN`, `MIN`, `MAX`, `FIRST`, `LAST`, `COUNT`).
    Windowed aggregations produce suffixed columns, e.g.
    `acceleration_norm_max`
-   `SIGNAL_SAMPLING_STRATEGY_FIXED_RATE`: resample at a fixed rate
-   `SIGNAL_SAMPLING_STRATEGY_ON_CHANGE`: emit a row only when the value
    changes

**Events** derive time intervals from other projections. Each event
definition has an `occurrences` block whose `expr` is an
:ref:`expression <multimodal-expressions>` over source columns, with
declared dependencies and tunable `parameters`:

.. code-block:: yaml

    projections:
      - id: derived_events
        sources:
          - name: vehicle_steering_signals
            projections:
              - vehicle_steering_signals
        events:
          definitions:
            - id: high_steering
              name: High steering
              description: Steering above threshold for a minimum duration.
              occurrences:
                expr: contiguous(abs(vehicle_steering_signals.steering_angle) > steering_high_threshold, steering_high_min_duration_ns)
                depends_on: [vehicle_steering_signals.steering_angle]
                parameters:
                  steering_high_threshold:
                    value: { number_value: 1.0 }
                    quantity: steering_angle
                  steering_high_min_duration_ns:
                    value: { int64_value: "500000000" }
                    quantity: time
                    unit: ns

**Summaries** compute one scalar per episode, ideal for powering sidebar
filters like "episodes containing a pedestrian":

.. code-block:: yaml

    projections:
      - id: summaries
        sources:
          - name: semantic_labels
            projections:
              - semantic_labels
          - name: vehicle_speed_signals
            projections:
              - vehicle_speed_signals
        summaries:
          columns:
            - id: has_pedestrian
              compute:
                expr: any(semantic_labels.label.startsWith("human.pedestrian"))
                depends_on: [semantic_labels.label]
            - id: speed_max
              quantity: speed
              unit: m/s
              compute:
                expr: max(vehicle_speed_signals.speed)
                depends_on: [vehicle_speed_signals.speed]

.. _multimodal-expressions:

Expression language
-------------------

Manifests use a constrained expression language in channel binding `where`
clauses, signal column `value` fields, event `occurrences.expr` fields, and
summary `compute.expr` fields. Expressions reference source columns by
dotted path (e.g. `vehicle_speed_signals.speed`) and may reference declared
event `parameters` by name.

The supported syntax is as follows.

**Channel binding `where` filters**

.. code-block:: text

    path == "string"
    path == number
    path > number

**Compute expressions** (event occurrences and summary columns)

.. code-block:: text

    contiguous(pred, min_duration_param)  # intervals where pred holds for at
                                          # least the given duration
    overlaps(pred1, pred2)                # intervals where both hold
    changed(path)                         # instant events when a value changes;
                                          # may be &&-chained with filter
                                          # predicates
    unique(path)                          # distinct values
    any(pred)                             # true if pred holds anywhere
    max(path), max(abs(path))             # maximum (absolute) value
    min(path), min(abs(path))             # minimum (absolute) value
    count(pred), count(unique(path))      # occurrence / distinct-value counts

**Predicates** (usable inside the expressions above, or standalone)

.. code-block:: text

    path.startsWith("prefix")
    abs(path) > param_or_number
    path > param_or_number
    path < param_or_number
    path == "string"
    !path                       # boolean NOT
    changed(path)
    path                        # bare path; truthy check
    pred1 && pred2 [&& ...]     # logical AND
    pred1 || pred2 [|| ...]     # logical OR

.. note::

    This is a deliberately constrained language: only the constructs listed
    above are supported. Expressions outside this grammar are rejected when
    the manifest is compiled.
