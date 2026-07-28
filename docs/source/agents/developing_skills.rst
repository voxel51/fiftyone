
.. _agents-developing:

Developing Tools & Skills
=========================

.. default-role:: code

There are two ways to extend what agents can do in FiftyOne:

- **Operators**: write a :ref:`FiftyOne operator <developing-operators>` and it becomes immediately
  callable by any agent through the MCP server, no extra wiring required
- **Skills**: write a :ref:`FiftyOne skill <developing-skills-authoring>` that teaches the agent *when* and *how* to execute a sequence of code/operator invocations to achieve a specific higher-level task

Together, an operator handles the execution and a skill provides the guidance.
You can ship both in the same :ref:`plugin <developing-plugins>`.

.. _developing-operators-as-tools:

Operators as Agent Tools
________________________

Any operator you register in a :ref:`FiftyOne plugin <developing-plugins>` is automatically available to
agents. When an agent connects via the MCP server it can:

1. Call ``list_operators`` to discover all installed operators
2. Call ``get_operator_schema`` to understand what inputs an operator accepts
3. Call ``execute_operator`` to run it

No extra configuration needed. Install the plugin, and agents can use it.

Here is a minimal operator that filters samples by confidence:

.. code-block:: python

    import fiftyone.operators as foo
    from fiftyone.operators import types
    from fiftyone import ViewField as F

    class ShowHighConfidence(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(
                name="show_high_confidence",
                label="Show High Confidence",
                description="Filter samples by minimum confidence threshold",
            )

        def resolve_input(self, ctx):
            inputs = types.Object()
            inputs.float(
                "threshold",
                label="Minimum confidence",
                default=0.9,
            )
            return types.Property(inputs)

        def execute(self, ctx):
            threshold = ctx.params.get("threshold", 0.9)
            view = ctx.dataset.filter_labels(
                "predictions", F("confidence") > threshold
            )
            ctx.ops.set_view(view)

    def register(p):
        p.register(ShowHighConfidence)

Once the plugin is installed, an agent can discover and use it naturally:

.. code-block:: text

    "Show me samples with confidence above 0.85"

The agent calls ``execute_operator`` with
``{"operator": "show_high_confidence", "params": {"threshold": 0.85}}``.

See :ref:`Developing plugins <developing-plugins>` for the full operator and
panel API.

.. _developing-skills-authoring:

Writing a Skill
_______________

A skill is a ``SKILL.md`` file that follows the
`Agent Skills <https://agentskills.io>`_ specification. It tells the agent
when to activate the workflow, what prerequisites to check, and what steps
to follow.

**File layout:**

.. code-block:: text

    skills/
    └── my-skill/
        └── SKILL.md

**SKILL.md format:**

.. code-block:: markdown

    ---
    name: my-skill
    description: When to activate this skill (shown to the agent)
    category: Curation
    emoji: ✂️
    ---

    # Overview
    What this skill does in one paragraph.

    # Prerequisites
    - FiftyOne installed
    - MCP server configured (if interacting with live datasets)

    # Key Directives
    ALWAYS load the dataset before running any operation.
    NEVER delete samples without confirming with the user first.

    # Workflow
    Step-by-step instructions the agent follows to complete the task.

    # Troubleshooting
    Common errors and how to resolve them.

.. note::

    The ``description`` field is the most important: it determines when the
    agent decides to invoke this skill. Make it specific and action-oriented:
    *"Import a dataset from local disk, Hugging Face Hub, or cloud storage into
    FiftyOne"* is better than *"import data"*.

.. _developing-skills-from-plugins:

Skills from Plugins
___________________

The cleanest way to ship an operator and its skill together is to declare the
skill in your plugin's :ref:`fiftyone.yml <plugin-fiftyone-yml>`:

.. code-block:: yaml

    name: "@myorg/my-plugin"
    version: "1.0.0"
    fiftyone:
      version: ">=0.23"
    skills:
      - my-skill

.. note::

    The name declared under ``skills:`` must match the ``name`` field in the
    corresponding skill's YAML frontmatter. FiftyOne resolves skills by
    scanning the plugin's ``skills/`` directory and matching on that field.

When a user installs your plugin, the skill is available automatically. The
agent can discover the operator via MCP *and* has structured guidance on how
to use it, without any manual setup on the user's side.

This is how the FiftyOne plugin ecosystem becomes an agent capability
ecosystem: every plugin that ships a skill extends what agents can do out
of the box.

.. _developing-skills-contributing:

Contributing a Skill
____________________

.. note::

    Only contribute a skill here if it is generic, polished, and broadly useful
    across projects. Skills built for a specific dataset, model, or internal
    workflow are better kept in your own plugin.

To add a skill to the `voxel51/fiftyone-skills
<https://github.com/voxel51/fiftyone-skills>`_ repository:

1. **Fork** the repository
2. **Copy** an existing skill folder as a starting point (e.g., ``skills/fiftyone-find-duplicates/``)
3. **Update** ``SKILL.md`` with your workflow
4. **Add** your skill to ``.claude-plugin/marketplace.json``
5. **Test** it with your AI assistant
6. **Submit** a Pull Request

.. _developing-skills-resources:

Resources
_________

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Resource
     - Description
   * - `FiftyOne Skills <https://github.com/voxel51/fiftyone-skills>`_
     - Skills repository and contributing guide
   * - :ref:`Developing plugins <developing-plugins>`
     - Full operator and panel API reference
   * - `FiftyOne MCP Server <https://github.com/voxel51/fiftyone-mcp-server>`_
     - MCP server for AI integration
   * - `Agent Skills Spec <https://agentskills.io>`_
     - SKILL.md format specification
   * - `Discord Community <https://discord.gg/fiftyone-community>`_
     - Get help and share ideas
