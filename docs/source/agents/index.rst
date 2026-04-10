
.. _data-agents:

Data Agents
===========

.. default-role:: code

FiftyOne is the only platform where you can agentically build and automate
your **entire Physical AI data pipeline** in one place, from raw data to
curated, annotated, evaluated datasets, powered by the same plugin framework
that makes FiftyOne infinitely extensible.

.. raw:: html

    <div class="hero-nav-pills">
      <a target="_blank" href="https://claude.ai/code" class="nav-pill nav-pill-outlined">
        <img alt="Claude" src="https://cdn.voxel51.com/images/integrations/anthropic-128.png" width="18" height="18">
        Claude Code
      </a>
      <a target="_blank" href="https://cursor.com" class="nav-pill nav-pill-outlined">
        Cursor
      </a>
      <a target="_blank" href="https://github.com/features/copilot" class="nav-pill nav-pill-outlined">
        <img alt="GitHub Copilot" src="https://cdn.voxel51.com/images/integrations/github-copilot-128.png" width="18" height="18">
        GitHub Copilot
      </a>
      <a target="_blank" href="https://platform.openai.com/docs/codex" class="nav-pill nav-pill-outlined">
        <img alt="Codex" src="https://cdn.voxel51.com/images/integrations/openai-128.png" width="18" height="18">
        Codex
      </a>
      <a target="_blank" href="https://github.com/sst/opencode" class="nav-pill nav-pill-outlined">
        OpenCode
      </a>
    </div>

    <div class="agents-video-row">
      <div class="agents-video-col">
        <div class="agents-video-wrapper">
          <video autoplay loop muted playsinline style="width: 100%; border-radius: 8px;">
            <source src="https://cdn.voxel51.com/agents/import_dataset_video.webm" type="video/webm">
          </video>
        </div>
      </div>
      <div class="agents-video-col">
        <div class="agents-video-wrapper">
          <video autoplay loop muted playsinline style="width: 100%; border-radius: 8px;">
            <source src="https://cdn.voxel51.com/agents/develop_plugins_video.webm" type="video/webm">
          </video>
        </div>
      </div>
    </div>

.. _data-agents-what:

What agents can do in FiftyOne
-------------------------------

Agents don't just answer questions, in FiftyOne they take action on your
data. Every workflow below runs with a simple prompt, no custom scripting
required.

.. raw:: html

    <div class="agents-workflow-grid">

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">📥</div>
          <h4 class="agents-workflow-title">Import &amp; Export</h4>
          <p class="agents-workflow-desc">Load datasets from any source — local disk, Hugging Face Hub, cloud storage — and export to COCO, YOLO, VOC, CSV and more. No custom loaders needed.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">✂️</div>
          <h4 class="agents-workflow-title">Curate &amp; Deduplicate</h4>
          <p class="agents-workflow-desc">Surface quality issues, remove near-duplicate images, audit annotations, and analyze class distributions — all driven by a single prompt.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">🏷️</div>
          <h4 class="agents-workflow-title">Annotation QA</h4>
          <p class="agents-workflow-desc">Run mistakenness scoring to surface label errors before training. Catch annotation mistakes that create artificial ceilings on model performance.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">🤖</div>
          <h4 class="agents-workflow-title">Model Inference &amp; Evaluation</h4>
          <p class="agents-workflow-desc">Run Zoo models for detection, classification, and segmentation. Compute mAP, precision, recall, and confusion matrices — then dive into failure modes in the App.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">🗺️</div>
          <h4 class="agents-workflow-title">Embeddings &amp; Visualization</h4>
          <p class="agents-workflow-desc">Compute CLIP, SigLIP, or custom embeddings and explore your dataset in 2D. Mine hard samples, find clusters, and recommend the best data for annotation.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-workflow-card">
          <div class="agents-workflow-icon">🔧</div>
          <h4 class="agents-workflow-title">Build Plugins &amp; Notebooks</h4>
          <p class="agents-workflow-desc">Ask an agent to scaffold a custom FiftyOne operator or panel, or generate Jupyter notebooks for tutorials, ML pipelines, and reproducible workflows.</p>
        </div>
      </div>

    </div>

.. _data-agents-why:

Why FiftyOne for data agents
-----------------------------

.. raw:: html

    <div class="agents-differentiator-callout">
      <strong>The plugin framework is the differentiator.</strong>
      Every skill and agent workflow in FiftyOne is backed by the same
      <a href="../plugins/index.html">plugin and operator framework</a> that
      powers the FiftyOne App — which means agents can trigger any operator,
      build custom visualizations, and extend the platform in ways no other
      data tool supports.
    </div>

    <div class="agents-star-grid">

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> One tool for the full pipeline</div>
          <p class="agents-star-desc">Data preparation, generation, annotation, evaluation, and failure-mode analysis — all in a single platform. No stitching together separate tools.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> Customizable workflows</div>
          <p class="agents-star-desc">Skills are fully editable SKILL.md files — tailor any workflow to your exact data format, model, or team convention.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> Chain agents together</div>
          <p class="agents-star-desc">Compose complex pipelines by chaining skills: import → compute embeddings → find duplicates → QA annotations → export. Each step is an agent call.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> Accessible to everyone</div>
          <p class="agents-star-desc">Agents run autonomously with simple prompts. Non-ML experts can analyze data, create workflows, and draw insights without writing a line of Python.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> Build custom plugins</div>
          <p class="agents-star-desc">Ask an agent to scaffold and implement a plugin operator or panel. The flexible plugin framework lets you build anything you can imagine.</p>
        </div>
      </div>

      <div class="col-md-6">
        <div class="agents-star-item">
          <div class="agents-star-heading"><span>⭐</span> Encodes Physical AI best practices</div>
          <p class="agents-star-desc">Skills embed proven workflows from real Physical AI projects — so agents guide you toward best practices, not just what's easy to prompt.</p>
        </div>
      </div>

    </div>

.. toctree::
   :maxdepth: 1
   :hidden:

   Skill Ecosystem <skills_ecosystem>
   Develop Skills <skills>
   MCP Server <mcp>
