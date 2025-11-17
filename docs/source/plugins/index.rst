.. _plugins-ecosystem:

Plugins Ecosystem
=================

.. default-role:: code

Welcome to the FiftyOne Plugins ecosystem! 🚀

Here you'll discover cutting-edge research, state-of-the-art models, and
powerful add-ons that unlock new FiftyOne workflows.

FiftyOne plugins allow you to extend and customize the functionality of the
core tool to suit your specific needs. From advanced computer vision models to
integrations with other popular AI tools, this curated collection of plugins
will transform FiftyOne into your bespoke visual AI development workbench.

.. _managing-plugins-enterprise:

Managing plugins and secrets in Enterprise
-------------------------------------------

.. note::

    The features described in this section are available only to
    :ref:`FiftyOne Enterprise <fiftyone-enterprise>` users.

In FiftyOne Enterprise, admins can centrally manage which plugins and
operators are enabled, set organization-wide defaults, and store sensitive
credentials (API keys, login details) securely via the Secrets interface—so teams
can safely run custom workflows from the App without hard-coding secrets.

Enterprise plugins can expose **delegated operations** that run on your compute
cluster or orchestrator and are tracked on a dataset's Runs page, providing a
history of ingestion, curation, and evaluation jobs.

Learn more:
  - `Enterprise plugins <https://docs.voxel51.com/enterprise/plugins.html>`_
  - `Secrets management <https://docs.voxel51.com/enterprise/secrets.html>`_
  - `Management SDK <https://docs.voxel51.com/enterprise/management_sdk.html>`_

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="plugin-search" placeholder="Search plugins by name, description, author, or category...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. customanimatedcta::
    :button_text: Showcase your own plugin
    :button_link: https://github.com/voxel51/fiftyone-plugins?tab=readme-ov-file#contributing
    :align: right
    
.. Plugins cards section -----------------------------------------------------

.. raw:: html

    <div id="plugin-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </nav>
        
    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. Add plugin cards below

.. include:: plugins_ecosystem/plugin_cards.rst

.. End of plugin cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End plugins cards section -------------------------------------------------

.. note::

   Community plugins are external projects maintained by their respective authors.
   They are not part of FiftyOne core and may change independently.
   Please review each plugin's documentation and license before use.

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   Overview <overview>
   Using plugins <using_plugins>
   Developing plugins <developing_plugins>
   API reference <api/plugins>
   TypeScript API reference <ts-api>
   plugins_ecosystem/*
