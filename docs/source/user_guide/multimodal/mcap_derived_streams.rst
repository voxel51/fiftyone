.. _multimodal-mcap-derived-streams:

MCAP Scripts
============

.. default-role:: code

.. note::

    MCAP scripts are only available in :ref:`FiftyOne Enterprise
    <fiftyone-enterprise>`.

MCAP scripts turn recorded messages into signals, event tracks, and 3D
geometry. Use them to plot a computed value, mark intervals that meet a
condition, or draw custom detections and paths alongside recorded data. One
script can produce several named outputs that share the same computation and
state.

Scripts run on demand in the browser. Saving a script stores its source,
inputs, and output declarations with the dataset. Results can be cached in the
browser, but scripts do not change the MCAP file or create saved dataset
events.

To keep a script private, save it in a dataset only you can access. Scripts
saved in shared datasets are visible to users with dataset access. You can also
publish scripts to the organization library for others to copy and reuse. Each
viewer chooses which scripts to run.

Create a script
---------------

1.  Open an MCAP sample and select **Scripts**. Create a script, give it a
    name, and select its input topics.
2.  Hover over an input and select **Inspect** to see its schema and a decoded
    message. Step through messages without moving playback. Use these values to
    check field paths, units, and coordinate frames.
3.  Declare the outputs you need: **Signal** for a numeric plot, **Events** for
    points or intervals on the timeline, or **Scene** for 3D geometry. Give
    each output a name that your function will return.
4.  Write a synchronous JavaScript or TypeScript function with a default
    export. The examples below show common uses. Expand **Event and scene API**
    in the editor for the current input and output types, scene helpers, and
    constraints.
5.  Run **Preview** over a short range. Check the output and diagnostics, then
    select **Save & apply**.
6.  Turn on **Enabled for you** and select your outputs in a plot, the Tracks
    view, or a 3D panel. For a signal, select its `value` field in the plot.

.. tip::

    Use **Copy Prompt** to ask a coding agent for help. It includes the current
    API, selected inputs and outputs, input schemas and example messages, and
    script examples. Add what you want to compute, the units and coordinate
    frame, and whether messages contain complete snapshots or incremental
    updates. Review the generated source and run Preview before saving.

Input inspection and copied context can be truncated. A missing schema is
reported as missing, not inferred from an example. Check the full recording
schema when an excerpt does not contain the fields you need.

Working with messages and state
-------------------------------

The function runs once per selected input message. Inputs arrive in time order;
messages at the same time follow source-record order. Topics need not publish
at the same rate or at matching timestamps. Use `event.stream` to distinguish
them and `event.state` to keep previous values or join data across topics.

State starts empty for each script and recording and is shared by all outputs.
Keep it small: retain the latest metadata or an active interval, not every
message. A seek may replay earlier messages to rebuild state. Backward seeks
use historical results without applying later state to earlier times.

Return an object whose keys match your declared output names. Omit a key to
leave that output unchanged, or return `undefined` to emit nothing. The app's
API reference describes the full contract. These distinctions matter when
writing a script:

-   **Signals:** return a finite number, or `null` for a gap. A unit label does
    not convert values.
-   **Events:** return point events or intervals. Reuse an event's ID to update
    it; an empty array does not erase past events. Use recording-relative
    seconds and do not extend an interval beyond the current input time.
-   **Scenes:** return a complete snapshot. Objects omitted from the snapshot
    disappear; an empty snapshot clears it. Omitting the output key keeps the
    previous snapshot within computed time. A frame name does not convert
    coordinates: supply geometry in that frame, in meters.

Decoded messages preserve 64-bit integers as `bigint` and binary fields as
`Uint8Array`. Filter invalid numeric readings before emitting signals or
geometry.

Examples
--------

These examples use illustrative message fields. Inspect your input and adapt
the field paths, units, and conditions before running them.

Plot speed from velocity
~~~~~~~~~~~~~~~~~~~~~~~~

Select a topic whose messages contain `velocity.x` and `velocity.y` in meters
per second. Declare a **Signal** output named `speed` with unit `m/s`:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y } = event.message.velocity;
      const speed = Math.hypot(x, y);
      return { speed: Number.isFinite(speed) ? speed : null };
    }

Mark intervals above a speed threshold
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To find sustained motion above 10 m/s, use the same input and add an **Events**
output named `fast_motion`. This script plots speed and extends an interval on
each message until speed falls to the threshold or below:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y } = event.message.velocity;
      const speed = Math.hypot(x, y);
      if (!Number.isFinite(speed)) {
        delete event.state.active;
        return { speed: null };
      }

      const now = event.time.seconds;
      if (speed > 10 && !event.state.active) {
        event.state.active = {
          id: "fast-" + (event.state.nextId = (event.state.nextId ?? 0) + 1),
          start: now,
        };
      }

      const intervals = [];
      if (event.state.active) {
        intervals.push({
          ...event.state.active,
          label: "Fast motion",
          end: now,
          attributes: { ongoing: speed > 10 },
        });
        if (speed <= 10) delete event.state.active;
      }
      return { speed, fast_motion: intervals };
    }

The stable ID lets the track show an interval while it is still in progress.
The `ongoing` attribute marks intervals without an observed closing message,
including those interrupted by an invalid reading. This example ends an
interval at the first reading at or below the threshold; adjust that policy for
your analysis.

Draw custom detections in 3D
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Suppose a topic contains an `objects` array with an `id`, a `center` vector,
`size` as length/width/height, and `yaw`. Coordinates and dimensions are in
meters in the `base_link` frame; yaw is in radians. Declare a **Scene** output
named `vehicles`:

.. code-block:: javascript

    export default function transform(event, scene) {
      return {
        vehicles: scene.frame("base_link", event.message.objects.map(obj =>
          scene.box({
            id: String(obj.id),
            position: obj.center,
            size: obj.size,
            yaw: obj.yaw,
          })
        )),
      };
    }

Each message supplies a complete snapshot with unique object IDs. For
incremental detections, keep the current objects in state, apply additions and
removals, then emit the full snapshot. For positions and dimensions on separate
topics, keep the latest dimensions by ID and join them when positions arrive.
**Copy Prompt** includes a two-input example of this pattern. Use the scene
line helper to draw paths or trajectories; its signature is in the app
reference.

Preview and computation
-----------------------

Preview renders signals, event tracks, and scenes with a shared cursor that is
independent of playback. Select an event to inspect its boundaries and
attributes, or expand **Inspect output** to see the structured values.

Preview covers a bounded time range. Check its computation coverage: uncomputed
time does not mean there are no events. Charts and scenes can also show a
reduced or truncated set of computed results; the preview reports these limits.

A script may need earlier messages to compute the selected range. **Cancel**
stops the current preview. Applied scripts offer **Pause** and **Resume**
controls. When the recording read limit is reached, **Lift** removes that
session limit so computation can continue; execution and memory limits still
apply. Results and state checkpoints can be reused from the browser cache.
Editing source, inputs, or output declarations starts a new computation.

Scripts run synchronously in an isolated environment without network, storage,
or browser APIs, timers, `Date`, or `Math.random`. Execution time, memory,
input reads, and retained output are bounded. Keep state and output small and
use diagnostics to identify a limit or a failing message. One script's failure
does not stop unrelated streams. Scripts read recorded topics, not other
scripts' outputs.

Save, share, and reuse
----------------------

**Your scripts** lists working copies saved with the current dataset. Saving,
editing, deleting, and importing these copies requires dataset edit permission.
**Enabled for you** takes effect without saving source edits and does not
enable a script for anyone else. This setting is stored in your browser for
your user and dataset. Viewers without edit permission can enable saved
scripts.

Select **Share to org** to publish the current source, input names, and output
declarations to **Org scripts**. Organization members with access to the
dataset can browse and copy its shared scripts. Sharing is separate from **Save
& apply** and does not save pending changes to the dataset copy. It does not
include input message examples or computed results.

To reuse an org script, select it and choose **Copy to this dataset**. This
creates an independent, disabled draft. Review its input topics, adjust any
topic names in the source, and preview it before saving and enabling it.

Only the creator and organization administrators can update or delete an org
script. Use **Save to org** when editing an org entry, or **Update org script**
from a linked working copy. Choose **Share as new** to publish a separate
entry. Updates and deletions do not change existing dataset copies. If someone
else has edited the script, reload it and review their changes before saving.

Use **Export script to file** to download the current editor contents,
including unsaved changes. **Import script from file** brings that JSON file
into another dataset as a new, disabled draft. Files contain the script name,
source, inputs, and output declarations; permissions, enablement, and computed
results do not transfer. Check topic names and preview each imported script
before saving it.
