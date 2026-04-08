
.. _data-agents-mcp-guide:

FiftyOne MCP Server
===================

.. default-role:: code

Enable agents to explore datasets, execute operators, and control the
FiftyOne App through natural language. The server exposes 45+ MCP tools
across data operations, App UI control, and the full operator/plugin
ecosystem.

.. code-block:: text

    "List all my datasets"
    "Load quickstart dataset and show summary"
    "Find similar images in my dataset"

The server starts with 50 built-in operators. Install plugins to expand
functionality — the AI can discover and install plugins automatically when
needed (brain, zoo, annotation, evaluation, and more).

.. _mcp-tools:

Available Tools
---------------

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

.. _mcp-modes:

Tool Modes
----------

45+ tools are organized by runtime mode:

**SDK**
    Data operations that work everywhere — datasets, aggregations, schema,
    samples, operators, plugins. No App connection needed.

**App**
    Controls the FiftyOne App UI in real time: ``set_view``, ``open_panel``,
    ``notify``, ``select_samples``, ``reload``, and 25+ more. Requires a
    connected browser via ``ctx.ops``.

**Session**
    Bootstrap tools for starting a local App server (``launch_app``). Used
    from terminal environments.

Which tools are available depends on your integration:

.. list-table::
   :widths: 30 25 45
   :header-rows: 1

   * - Integration
     - Modes
     - Use case
   * - FiftyOne App plugin
     - ``app`` + ``sdk``
     - Agent panel inside the App (full UI control + data operations)
   * - Terminal / CLI
     - ``session`` + ``sdk``
     - Headless agent (launch the App, query data, execute operators)

Every tool is tagged with a risk level for auto-approval decisions:

- **LOW** — Safe to auto-execute without prompting (read-only queries, UI state changes)
- **OPERATOR** — Wraps a FiftyOne operator whose own severity should be checked before executing

.. _mcp-install:

Quick Start
-----------

.. _mcp-step1:

Step 1 — Install the MCP Server
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

    pip install fiftyone-mcp-server

.. warning::

   Use the same Python environment where FiftyOne is installed when
   configuring your AI tool. If you installed it in a virtual environment or
   conda environment, activate it or specify the full path to the executable.

.. _mcp-step2:

Step 2 — Configure Your AI Tool
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

      Add to ``~/.cursor/mcp.json``:

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

   .. tab:: VS Code

      Add to ``.vscode/mcp.json``:

      .. code-block:: json

          {
            "servers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

   .. tab:: ChatGPT Desktop

      Edit ``~/Library/Application Support/ChatGPT/config.json``:

      .. code-block:: json

          {
            "mcpServers": {
              "fiftyone": {
                "command": "fiftyone-mcp"
              }
            }
          }

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

.. _mcp-step3:

Step 3 — Use It
~~~~~~~~~~~~~~~~

.. code-block:: text

    "List all my datasets"
    "Load quickstart dataset and show summary"
    "Open the map panel and show me the embeddings"
    "Select samples with confidence above 0.9"
    "What plugins are available? Install the brain plugin"
    "Find near-duplicate images in my dataset"

Claude will automatically discover operators and execute the appropriate
tools.

.. _mcp-contributing:

Contributing
------------

To set up a local development environment:

.. code-block:: bash

    git clone https://github.com/voxel51/fiftyone-mcp-server.git
    cd fiftyone-mcp-server
    poetry install

    # Run the server
    poetry run fiftyone-mcp

    # Test and format
    poetry run pytest
    poetry run black -l 79 src/

    # Inspect with the MCP inspector
    npx @modelcontextprotocol/inspector poetry run fiftyone-mcp

.. _mcp-resources:

Resources
---------

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Resource
     - Description
   * - `FiftyOne Docs <https://docs.voxel51.com>`_
     - Official documentation
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
