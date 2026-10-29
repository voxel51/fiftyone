.. _multimodal-mcap-scripts:

MCAP Scripts
============

.. default-role:: code

.. note::

    MCAP scripts are only available in :ref:`FiftyOne Enterprise
    <fiftyone-enterprise>`.

A script is a function over recorded MCAP messages. Its outputs appear as
plotted signals, timeline intervals and events, 3D geometry, or HTML panels
that follow playback. One script can fill several named outputs from the same
computation.

Scripts run in the browser, on demand, over the time you view plus a short
lookahead. The dataset stores only a script's definition: source, inputs,
outputs, and parameters. Scripts never change the MCAP file or write results
to the dataset; results can be cached in your browser.

Anyone with access to a dataset can see and run its scripts. Each viewer
chooses which scripts run for them.

Create a script
---------------

You describe what you want, an agent writes the script, and the App runs it on
your recording.

1.  Open an MCAP sample, select **Scripts**, and create a script.
2.  Select **Copy for agent**, optionally describe what you want, and select
    **Copy**. The copy holds every topic with its schema, the API, worked
    examples, and the current file. Select **Copy message examples too** to
    add an example message of the topics you tick. Paste it into a chat.
3.  Paste the script the agent writes into the file. A complete script
    replaces the file, with its changed lines marked, and the panels beside
    it show the inputs, parameters, and outputs that its
    :ref:`header <multimodal-mcap-scripts-header>` declares.
4.  Run **Preview** over a short range. **Outputs** shows what each output
    produced. If it fails, select **Copy fix** and paste that into the same
    chat. It holds what failed, the message it failed on, that topic's
    schema, and the current file.
5.  Select **Save & apply**. A new script turns on for you when you first save
    it.
6.  Next to **Saved**, select **Plot**, **Tracks**, **3D**, or **HTML** to
    show an output. The **Topics** tab has the same actions under **Scripts**.

The header is the only place that chooses topics and outputs. **Inspect**, next
to an input, shows its schema and decoded messages without moving playback.
For an input that the episode does not have, **Use** replaces it with the
closest topic. Type issues are advisory: they do not block Preview or Save.

.. tip::

    An agent with tools, such as a coding agent, can work through
    :ref:`the SDK <multimodal-mcap-scripts-python>` instead. While **Scripts**
    is open, the App shows each save: it marks the lines that a new revision
    changed, and offers to run a new script.

.. _multimodal-mcap-scripts-header:

Script files
------------

A script is one file. A header at its top declares the script's name, inputs,
outputs, and parameters, and the transform follows:

.. code-block:: typescript

    export const script = {
      "name": "Grasp phases",
      "apiVersion": 1,
      "inputs": ["/robot/gripper_state", "/robot/joint_speed_norm"],
      "outputs": {
        "closed": { "type": "condition", "label": "Gripper closed" },
        "joint_speed": { "type": "signal", "unit": "rad/s" }
      },
      "params": {
        "closed_above": { "type": "number", "default": 0.1, "min": 0 }
      },
      "execution": "stateless"
    };

    export default function transform(event) {
      if (event.stream === "/robot/joint_speed_norm") {
        return { joint_speed: event.message.data };
      }
      return { closed: event.message.position > event.params.closed_above };
    }

The header takes these keys:

-   `name`: required.
-   `inputs`: required, a list of topic names.
-   `outputs`: required. Maps each output name to its `type` (`signal`,
    `condition`, `events`, `scene`, or `html`) and an optional `label`.
    Signals can also declare a `unit` and `fields`.
-   `params`: maps each parameter name to its `type` (`number`, `boolean`,
    `string`, or `select`) and `default`, and an optional `label`. Numbers can
    declare `min`, `max`, and `step`; selects list their `options`.
-   `execution`: `"stateful"` (the default) or `"stateless"`. See
    :ref:`Stateless and stateful scripts <multimodal-mcap-scripts-execution>`.
-   `apiVersion`: `1` (the default).

The header must be strict JSON: quoted keys, no comments, and no trailing
commas. The App, the SDK, and the server read it without running the file, and
a saved script's fields always match its header. The editor's panels show what
the header declares, and their quick fixes rewrite the header. The App gives a
script saved without a header one from its saved fields when you next edit it.

Messages, state, and outputs
----------------------------

The function runs once for each input message. In a computed window, messages
arrive in time order. Topics can publish at different rates; `event.stream`
tells you which topic a message came from.

.. _multimodal-mcap-scripts-execution:

Stateless and stateful scripts
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

New scripts are **Stateless**. They compute any window, in any order, so a seek
anywhere starts at once. `event.state` is empty and frozen. Use stateless
scripts when each message can produce its outputs alone, and use a
**Condition** output to mark intervals.

Select **Stateful** when outputs depend on earlier messages. A stateful script
computes from the start of the recording, and a seek may replay earlier
messages. `event.state` starts empty for each recording and all outputs share
it. Keep it small: the latest values or an open interval, not every message.

If a message throws, the script skips that message's outputs but keeps its
earlier changes to `event.state`. Validate input before you change state.

Outputs
~~~~~~~

Return an object keyed by output name. Omit a key to leave that output
unchanged.

-   **Signals:** a finite number, or `null` for a gap. With declared fields,
    an object with exactly those fields (up to 16), each a number or `null`.
    Units are labels; they do not convert values.
-   **Conditions:** `true`, `false`, or `null` for unknown. Each run of `true`
    is one interval. `false`, `null`, a skipped message, or uncomputed time
    ends it.
-   **Events:** points or intervals in recording-relative seconds. Reuse an ID
    to update an event. A track draws up to 500 events around the playhead and
    marks the rest as not drawn; use a condition for dense states.
-   **Scenes:** a complete snapshot in meters, in the named frame. Objects not
    in the snapshot disappear; an empty snapshot clears the scene.
-   **HTML:** `{ html, css }`, which replaces the panel. `{ html: "" }` clears
    it. See :ref:`HTML panels <multimodal-mcap-scripts-html>`.

Decoded messages keep 64-bit integers as `bigint` and binary fields as
`Uint8Array`.

Parameters
~~~~~~~~~~

Declare up to 16 parameters, each with a name, type, and default. Number
parameters can have a minimum, maximum, and step; select parameters list
their choices. Read values with `event.params.name`.

Viewers can change parameter **Values** without editing the script. Values
stay in that viewer's browser and are never shared or exported.

Examples
--------

These examples use sample field names. Inspect your inputs and adapt them.

Plot speed from velocity
~~~~~~~~~~~~~~~~~~~~~~~~

Declare a **Signal** output named `speed` with unit `m/s`:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y } = event.message.velocity;
      const speed = Math.hypot(x, y);
      return { speed: Number.isFinite(speed) ? speed : null };
    }

To plot each component, declare fields `x`, `y`, and `z` on a `velocity`
signal and return all three:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y, z } = event.message.velocity;
      const finiteOrGap = value => Number.isFinite(value) ? value : null;
      return {
        velocity: { x: finiteOrGap(x), y: finiteOrGap(y), z: finiteOrGap(z) },
      };
    }

Mark intervals above a speed threshold
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Add a **Condition** output named `fast_motion` and a number parameter named
`threshold`:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y } = event.message.velocity;
      const speed = Math.hypot(x, y);
      if (!Number.isFinite(speed)) return { speed: null, fast_motion: null };
      return { speed, fast_motion: speed > event.params.threshold };
    }

An invalid reading returns `null`, which ends the interval.

When intervals need their own IDs, labels, or attributes, select **Stateful**
and emit **Events**, keeping the open interval in `event.state`:

.. code-block:: javascript

    export default function transform(event) {
      const { x, y } = event.message.velocity;
      const speed = Math.hypot(x, y);
      if (!Number.isFinite(speed)) {
        delete event.state.active;
        return { speed: null };
      }

      const now = event.time.seconds;
      if (speed > event.params.threshold && !event.state.active) {
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
          attributes: { ongoing: speed > event.params.threshold, peak: speed },
        });
        if (speed <= event.params.threshold) delete event.state.active;
      }
      return { speed, fast_motion: intervals };
    }

Draw custom detections in 3D
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

For a topic with an `objects` array of boxes in the `base_link` frame, declare
a **Scene** output named `vehicles`:

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

Give each object a unique ID. For incremental detections, select **Stateful**,
keep the current objects in state, and emit the full set.

The scene helpers are `box`, `line`, `sphere`, `cylinder`, `arrow`, `text`,
`sector`, and `mesh`. Use `line` for paths and `sector` for sensor coverage.
**API and LLM guidance** lists their options and size limits.

.. _multimodal-mcap-scripts-html:

HTML panels
~~~~~~~~~~~

An **HTML** output renders HTML, CSS, and inline SVG in a panel:

.. code-block:: javascript

    const esc = (value) =>
      String(value).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");

    export default function transform(event) {
      const { state, obstacle_distance: distance } = event.message;
      if (!Number.isFinite(distance)) return;
      return {
        status: {
          html: `<section class="card ${distance < 5 ? "alert" : ""}">
            <h3>Planner: ${esc(state)}</h3>
            <p>Obstacle: ${distance.toFixed(1)} m</p>
          </section>`,
          css: `.card { border: 1px solid var(--html-border); }
                .alert { border-color: var(--html-danger); }`,
        },
      };
    }

Escape message text before you insert it, as `esc` does.

No JavaScript runs in a panel. The App removes scripts, event handlers, links,
forms, images and media, embedded content, remote resources, and CSS at-rules,
animation, and fixed positioning, then reports what it removed. Static SVG and
`<details>` sections are allowed. A snapshot is limited to 256 KiB and 5,000
elements.

Theme colors follow the App's light and dark themes: `--html-fg`,
`--html-muted`, `--html-bg`, `--html-surface`, `--html-border`,
`--html-accent`, `--html-success`, `--html-warning`, `--html-danger`, and
`--html-code-bg`. Give each `<details>` a stable `id` so its open state
survives new snapshots.

Add a panel with **HTML** next to **Saved**, from **Topics**, or from the layout
menu. Each panel shows one output and keeps it in saved layouts. A panel whose
script is off or deleted stays in the layout and says why it is empty.

Preview and limits
------------------

Preview shows all outputs for up to 10 minutes of the recording, with its own
cursor. Select an event to inspect it, or expand **Inspect output**.
`console.log` and its siblings write to **Logs**, which stay in your browser
session.

Scripts run in a sandbox without network, storage, timers, `Date`, or
`Math.random`. Time, memory, reads, and retained output are bounded. A message
that throws is skipped. The run reports how many messages it skipped and where
the last one failed: topic, recording time, and source line. **Seek playback**
jumps there. A run stops after 100 consecutive failures, or when more than 5%
of messages fail after the first 1,000.

Changing source, inputs, outputs, execution mode, or parameter values starts a
new computation. Earlier results stay cached, so restoring a value reuses
them.

Enable, share, and reuse
------------------------

**Enabled for you** turns a saved script on or off for you only. Your choice
stays in your browser and overrides the dataset default.

**On by default for everyone with access** sets that default. Viewers who have
not chosen follow it. Changing it requires dataset edit permission, as do
saving, editing, and deleting scripts.

**Share to org** publishes a copy to **Org scripts**. Organization members with
access to the dataset can copy it with **Copy to this dataset**. Only its
creator and organization admins can update or delete an org script; that never
changes dataset copies.

**Export script to file** saves the editor contents as JSON. **Import script
from file** adds that JSON, or a script file with a header such as
`export_file()` writes, to another dataset as a draft. Check its topic names and
preview it before you save. Files, org scripts, and saved scripts never include
viewer values, enablement, or results.

.. _multimodal-mcap-scripts-python:

Manage scripts from Python
--------------------------

`dataset.scripts` lets a coding agent or a pipeline write, save, and share an
MCAP dataset's scripts without the App. Scripts are dicts. Methods that take a
script accept its ID or its name.

Gather what an agent needs to write a script:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("drives")
    scripts = dataset.scripts

    scripts.topics()  # topics, schemas, message counts, and schema text
    scripts.api()  # the fiftyone:scripts TypeScript declarations
    scripts.examples()  # worked examples

A topic's `definition` is its schema text, such as a ROS message definition,
which names the fields of `event.message`. It is `None` for binary schemas,
such as protobuf.

Write the script as one :ref:`file with a header
<multimodal-mcap-scripts-header>`, then save and enable it:

.. code-block:: python
    :linenos:

    source = open("grasp.ts").read()
    scripts.create(source=source)  # its fields come from the header
    scripts.update("Grasp phases", source=source)
    scripts.update("Grasp phases", name="Grasp")  # rewrites the header
    scripts.enable("Grasp")  # on by default for everyone
    scripts.disable("Grasp")
    scripts.delete("Grasp")

`create()` reads the script's fields from its header. Arguments that you also
pass, such as `name` or `outputs`, must match the header. For a source without
a header, pass `name`, `inputs`, and `outputs`, and optionally `execution`
(`"stateless"` by default) and `params`. `create()` also takes `enabled`
(`False` by default).

`update()` takes any of `name`, `inputs`, `outputs`, `source`, `execution`,
`params`, and `enabled`. A new source's header sets the fields it declares.
When you change fields without passing a source, `update()` rewrites the saved
header to match.

`enable()` and `disable()` set **On by default for everyone with access**.
They never change a viewer's own **Enabled for you** choice or parameter
**Values**, which stay in that viewer's browser.

The SDK validates definitions like the App does, but it does not compile or run
source. Preview a new script in the App before you enable it. Writes require
dataset edit permission. Viewers see changes the next time they open the
recording.

Move and share scripts:

.. code-block:: python
    :linenos:

    scripts.export_file("Grasp", "/tmp/grasp.ts")  # the file, with its header
    scripts.export_file("Grasp", "/tmp/grasp.json")  # the App's JSON format
    fo.load_dataset("other-drives").scripts.import_file("/tmp/grasp.ts")

    scripts.org.share("Grasp")  # publish to Org scripts
    scripts.org.share("Grasp", update="Grasp")  # replace your org copy
    scripts.org.list()
    scripts.org.copy("Grasp")  # an independent dataset copy
    scripts.org.delete("Grasp")

`export_file()` writes the source with its header to a `.ts`, `.js`, or `.mjs`
path, adding a header from the saved fields if the source has none. Other
paths get the JSON format. `import_file()` reads either.

Clones of a dataset or a view, and
:class:`FiftyOneDataset <fiftyone.types.FiftyOneDataset>` exports, keep the
dataset's scripts. Snapshots do not.

Scripts only run on MCAP datasets, so `dataset.scripts` refuses other formats.
