
.. _agents-using-agents:

Using Agents
============

.. default-role:: code

.. _using-agents-overview:

What Are Skills and MCP?
________________________

Skills and MCP solve different parts of the same problem. MCP is about
connection: it lets an agent talk to real systems, run real operations, and
get real results instead of just generating text. Skills are about guidance:
they teach the agent how to use those capabilities correctly for a specific
task. MCP exposes what the system can do, while skills explain how and when
to do it.

On their own, tools are powerful but ambiguous. Skills turn those tools into
repeatable workflows. They encode experience, decisions, and guardrails.
Together, they let agents move from *"I can call functions"* to *"I know how
to complete this task end to end."*

Two Parts, One System
---------------------

**FiftyOne MCP Server** connects agents to FiftyOne's 80+ operators, dataset
management, model inference, brain computations, and the App. It implements
the open `Model Context Protocol <https://modelcontextprotocol.io>`_ standard,
giving any compatible agent direct access to your data and tools.

**FiftyOne Skills** are expert workflows built on top. Each skill teaches the
agent how to complete a specific task: import data, find duplicates, visualize
embeddings. Skills handle the nuances so you don't have to.

.. _using-agents-quickstart:

Quick Start
___________

.. _using-agents-step1:

Step 1: Install the MCP Server
--------------------------------

.. code-block:: bash

    pip install fiftyone-mcp-server

.. warning::

   Install into the same Python environment where FiftyOne is installed.
   If you use a virtual environment or conda environment, activate it first
   or use the full path to the executable in your AI tool config.

To verify the installation:

.. code-block:: bash

    fiftyone-mcp

You should see:

.. code-block:: text

    Starting fiftyone-mcp server...
    fiftyone-mcp server initialized successfully

Press ``Ctrl+C`` to stop it. Your AI tool manages the server lifecycle
automatically once configured.

.. _using-agents-step2:

Step 2: Configure Your AI Tool
--------------------------------

.. tabs::

   .. tab:: Claude Code

      .. code-block:: bash

          claude mcp add fiftyone -- fiftyone-mcp

   .. tab:: Claude Desktop

      Edit ``~/Library/Application Support/Claude/claude_desktop_config.json``:

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

   .. tab:: Cursor

      Add to ``~/.cursor/mcp.json`` (global) or ``.cursor/mcp.json``
      (project-scoped):

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

      Or use the one-click install:
      `Install FiftyOne MCP in Cursor <cursor://anysphere.cursor-deeplink/mcp/install?name=fiftyone&config=eyJjb21tYW5kIjoiZmlmdHlvbmUtbWNwIn0>`_

      Restart Cursor after saving.

   .. tab:: VS Code

      Add to ``.vscode/mcp.json``:

      .. code-block:: json

          {
            "servers": {
              "fiftyone": {
                "command": "fiftyone-mcp",
                "type": "stdio"
              }
            }
          }

      Or use the one-click install:
      `Install FiftyOne MCP in VS Code <https://insiders.vscode.dev/redirect/mcp/install?name=fiftyone&config=%7B%22command%22%3A%22fiftyone-mcp%22%7D>`_

   .. tab:: Gemini CLI

      The Gemini CLI extension registers the MCP server automatically.
      Install skills and MCP together:

      .. code-block:: bash

          gemini extensions install https://github.com/voxel51/fiftyone-skills.git --consent

      If ``fiftyone-mcp`` is not on your PATH, edit the extension config
      to use the full path to the executable.

   .. tab:: Antigravity

      Create or edit ``.antigravity/mcp.json`` in your project directory:

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

      Restart Antigravity after saving.

   .. tab:: uvx (no install)

      If you have `uv <https://github.com/astral-sh/uv>`_ installed, skip
      the ``pip install`` step entirely:

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "uvx",
                "args": ["fiftyone-mcp-server"]
              }
            }
          }

.. _using-agents-step3:

Step 3: Install Skills
-----------------------

Skills teach your agent how to complete complex FiftyOne workflows end to
end. Run the command below to download the `universal installer <https://skil.sh>`_
and install the default skills pack from `voxel51/fiftyone-skills
<https://github.com/voxel51/fiftyone-skills>`_:

.. code-block:: bash

    curl -sL skil.sh | sh -s -- voxel51/fiftyone-skills

You can also :ref:`develop and install your own skills <developing-skills-authoring>`
to teach agents custom workflows specific to your project.

See the :ref:`Agent Ecosystem <agents-skills>` for the full list of
available skills and per-agent install instructions.

.. _using-agents-step4:

Step 4: Use It
---------------

.. code-block:: text

    "List all my datasets"
    "Load quickstart dataset and show summary"
    "Open the map panel and show me the embeddings"
    "Select samples with confidence above 0.9"
    "What plugins are available? Install the brain plugin"
    "Find near-duplicate images in my dataset"

Your agent automatically discovers operators and executes the appropriate
tools.

.. _using-agents-tools:

Available Tools
_______________

.. list-table::
   :widths: 5 25 10 60
   :header-rows: 1

   * -
     - Category
     - Tools
     - Description
   * - 📊
     - Dataset Management
     - 3
     - List, load, and summarize datasets
   * - 🎯
     - App Operations
     - 29
     - Control the App UI (views, panels, selection, …)
   * - ⚡
     - Operator System
     - 3
     - Discover and execute any FiftyOne operator
   * - 🔄
     - Pipelines
     - 2
     - Run pipelines and manage delegated operations
   * - 🔌
     - Plugin Management
     - 5
     - Discover, install, and manage plugins
   * - 🖥️
     - Session
     - 1
     - Launch the FiftyOne App server
   * - 📈
     - Aggregations
     - 8
     - Count, distinct, bounds, mean, histogram, …
   * - 🧬
     - Samples
     - 5
     - Add, tag, untag, and set values on samples
   * - 🗂️
     - Schema
     - 2
     - Inspect and modify dataset field schemas
   * - 🎨
     - App Config
     - 6
     - Color scheme, sidebar groups, active fields

.. _using-agents-modes:

Tool Modes
__________

Which tools are available depends on your integration:

.. list-table::
   :widths: 30 25 45
   :header-rows: 1

   * - Integration
     - Modes
     - Use case
   * - Voxel-Agent
     - ``app`` + ``sdk``
     - Agent in :ref:`FiftyOne Enterprise <fiftyone-enterprise>` (full UI control + data operations)
   * - Terminal / CLI
     - ``session`` + ``sdk``
     - Headless agent (launch the App, query data, execute operators)

.. _using-agents-resources:

Resources
_________

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Resource
     - Description
   * - `FiftyOne MCP Server <https://github.com/voxel51/fiftyone-mcp-server>`_
     - Source code and contributing guide
   * - `FiftyOne Skills <https://github.com/voxel51/fiftyone-skills>`_
     - Expert workflows for AI assistants
   * - `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_
     - Official plugin collection
   * - `Model Context Protocol <https://modelcontextprotocol.io>`_
     - MCP specification
   * - `PyPI Package <https://pypi.org/project/fiftyone-mcp-server/>`_
     - MCP server on PyPI
   * - `Discord Community <https://discord.gg/fiftyone-community>`_
     - Get help and share ideas
