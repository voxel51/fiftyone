
.. _data-agents-skills-guide:

FiftyOne Skills
===============

.. default-role:: code

Skills are packaged workflows that teach AI assistants to perform complex
computer vision tasks autonomously. Combined with the
`FiftyOne MCP Server <mcp.html>`_, you can find duplicates, run inference,
and explore datasets using natural language:

.. code-block:: text

    "Find and remove duplicate images from my dataset"
    "Import this COCO dataset and run object detection"
    "Visualize my embeddings and identify outliers"

Skills bridge the gap between natural language and FiftyOne's 80+ operators,
providing step-by-step guidance that AI assistants follow to complete complex
workflows.

.. _skills-available:

Available Skills
----------------

.. list-table::
   :widths: 5 20 45 10
   :header-rows: 1

   * -
     - Skill
     - Description
     - MCP
   * - 📥
     - `Dataset Import <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-dataset-import/SKILL.md>`_
     - Universal import for all media types, label formats, multimodal groups, and Hugging Face Hub
     - ✓
   * - 📤
     - `Dataset Export <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-dataset-export/SKILL.md>`_
     - Export datasets to COCO, YOLO, VOC, CVAT, CSV, Hugging Face Hub, and more
     - ✓
   * - 🔍
     - `Find Duplicates <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-find-duplicates/SKILL.md>`_
     - Find and remove duplicate images using brain similarity
     - ✓
   * - 🤖
     - `Dataset Inference <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-dataset-inference/SKILL.md>`_
     - Run Zoo models for detection, classification, segmentation, embeddings
     - ✓
   * - 📈
     - `Model Evaluation <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-model-evaluation/SKILL.md>`_
     - Compute mAP, precision, recall, confusion matrices, analyze TP/FP/FN
     - ✓
   * - 📊
     - `Embeddings Visualization <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-embeddings-visualization/SKILL.md>`_
     - Visualize datasets in 2D, find clusters, identify outliers
     - ✓
   * - 🧹
     - `Dataset Curation <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-dataset-curation/SKILL.md>`_
     - End-to-end curation: quality checks, annotation audit, duplicates, class distribution, splits
     - ✓
   * - 🔌
     - `Develop Plugin <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-develop-plugin/SKILL.md>`_
     - Create custom FiftyOne plugins (operators and panels)
     - —
   * - 🎨
     - `VOODO Design <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-voodo-design/SKILL.md>`_
     - Build UIs with VOODO React components and design tokens
     - —
   * - 📝
     - `Code Style <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-code-style/SKILL.md>`_
     - Write Python code following FiftyOne's official conventions
     - —
   * - 📓
     - `Create Notebook <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-create-notebook/SKILL.md>`_
     - Create Jupyter notebooks: getting-started guides, tutorials, recipes, ML pipelines
     - —
   * - 🏷️
     - `Issue Triage <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-issue-triage/SKILL.md>`_
     - Triage GitHub issues: validate status, categorize, generate responses
     - —
   * - 🔧
     - `Troubleshoot <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-troubleshoot/SKILL.md>`_
     - Fix common issues: dataset persistence, App connection, MongoDB errors, codecs, performance
     - —
   * - 🛡️
     - `Eval Plugin <https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-eval-plugin/SKILL.md>`_
     - Evaluate plugins for quality, security, and agent-readiness
     - —

Skills marked **✓** in the MCP column require the
`FiftyOne MCP Server <mcp.html>`_ to interact with live datasets.

.. _skills-install:

Quick Start
-----------

.. _skills-step1:

Step 1 — Install Skills
~~~~~~~~~~~~~~~~~~~~~~~

.. tabs::

   .. tab:: Universal Installer

      The recommended approach. Interactive prompts let you select skills,
      agents, and install scope (project or global).

      .. code-block:: bash

          curl -sL skil.sh | sh -s -- voxel51/fiftyone-skills

      Supported agents: Claude Code, Cursor, Codex, OpenCode, GitHub Copilot,
      Amp, Antigravity, Roo Code, Kilo Code, Goose

   .. tab:: Claude Code

      .. code-block:: bash

          # Register the skills marketplace
          /plugin marketplace add voxel51/fiftyone-skills

          # Install a skill
          /plugin install fiftyone-find-duplicates@fiftyone-skills

   .. tab:: Gemini CLI

      .. code-block:: bash

          gemini extensions install https://github.com/voxel51/fiftyone-skills.git --consent

.. _skills-step2:

Step 2 — Use It
~~~~~~~~~~~~~~~

Your AI assistant automatically loads the skill instructions and executes
the workflow:

.. code-block:: text

    "Write a FiftyOne plugin that displays model confidence"
    "Write Python code following FiftyOne conventions"

.. _skills-step3:

Step 3 — Set Up MCP Server (Optional)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Skills marked **MCP** require the FiftyOne MCP Server. See the
`MCP Server guide <mcp.html>`_ for full setup instructions.

.. code-block:: bash

    pip install fiftyone-mcp-server

.. warning::

   Use the same Python environment where FiftyOne is installed when
   configuring your AI tool. If you installed it in a virtual environment or
   conda environment, activate it or specify the full path to the executable.

.. _skills-structure:

Skill Structure
---------------

Each skill follows the `Agent Skills <https://agentskills.io>`_ specification:

.. code-block:: text

    skills/
    └── fiftyone-find-duplicates/
        └── SKILL.md          # Instructions for the AI assistant

**SKILL.md format:**

.. code-block:: markdown

    ---
    name: skill-name
    description: When to use this skill
    category: Curation
    ---

    # Overview
    What this skill does

    # Prerequisites
    Required setup

    # Key Directives
    ALWAYS/NEVER rules for AI

    # Workflow
    Step-by-step instructions

    # Troubleshooting
    Common errors and solutions

.. _skills-plugins:

Skills from Plugins
-------------------

FiftyOne plugins can ship their own skills by declaring them in
``fiftyone.yml``:

.. code-block:: yaml

    name: "@voxel51/my-plugin"
    skills:
      - skills/my-skill/SKILL.md

Plugin skills appear automatically in the
`Data Agents hub <index.html>`_ after a docs build.

.. _skills-contributing:

Contributing
------------

We welcome contributions! To create a new skill:

1. **Fork** `voxel51/fiftyone-skills <https://github.com/voxel51/fiftyone-skills>`_
2. **Copy** an existing skill folder (e.g., ``skills/fiftyone-find-duplicates/``)
3. **Update** ``SKILL.md`` with your workflow
4. **Add** your skill to ``.claude-plugin/marketplace.json``
5. **Test** with your AI assistant
6. **Submit** a Pull Request

.. _skills-feedback:

Feedback
--------

Help us improve FiftyOne Skills — just ask your AI assistant:

.. code-block:: text

    "Help me submit feedback about [your issue]"

The agent will gather session context, environment info, and can submit
directly via ``gh`` CLI or generate content for
`GitHub Issues <https://github.com/voxel51/fiftyone-skills/issues/new?template=skill-feedback.yml>`_.

.. _skills-resources:

Resources
---------

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Resource
     - Description
   * - `FiftyOne Docs <https://docs.voxel51.com>`_
     - Official documentation
   * - `FiftyOne MCP Server <https://github.com/voxel51/fiftyone-mcp-server>`_
     - MCP server for AI integration
   * - `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_
     - Official plugin collection
   * - `Agent Skills Spec <https://agentskills.io>`_
     - Skills format specification
   * - `PyPI Package <https://pypi.org/project/fiftyone-mcp-server/>`_
     - MCP server on PyPI
   * - `Discord Community <https://discord.gg/fiftyone-community>`_
     - Get help and share ideas
