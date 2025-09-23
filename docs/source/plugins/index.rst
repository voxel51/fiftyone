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

.. raw:: html

    <div style="margin:0; width: 100%; display:flex; justify-content:flex-end;">
        <a href="https://github.com/voxel51/fiftyone-plugins?tab=readme-ov-file#contributing" target="_blank" class="sd-btn sd-btn-primary book-a-demo plugins-cta" rel="noopener noreferrer">
            <div class="arrow">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-3">
                <path stroke="currentColor" stroke-width="1.5"
                        d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937"
                        vector-effect="non-scaling-stroke"></path>
                </svg>  
            </div>
            <div class="text">Showcase your own plugin</div>
        </a>
    </div>
    
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
