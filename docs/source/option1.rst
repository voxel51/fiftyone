FiftyOne
========

.. raw:: html

   <!-- OPTION 1: Notion-Style Help Center with Kapa AI Search -->
   <!-- Friendly, organized, with AI-powered search -->

   <style>
   /* Hide the page title */
   h1:first-of-type {
       display: none !important;
   }

   /* Hide right sidebar on this page */
   .bd-sidebar-secondary {
       display: none !important;
   }
   .bd-content:has(.bd-sidebar-secondary) .bd-article-container {
       max-width: 100% !important;
   }

   .help-hero {
       text-align: center;
       padding: 50px 20px 30px;
       background: #ffffff;
       margin: -20px -20px 0 -20px;
   }

   .help-hero .brand-line {
       font-size: 0.85rem;
       font-weight: 600;
       color: #ff6d04;
       text-transform: uppercase;
       letter-spacing: 2px;
       margin-bottom: 12px;
   }

   .help-hero h1 {
       font-size: 2.5rem;
       font-weight: 700;
       color: #181a1b;
       margin-bottom: 20px;
       display: block !important;
   }

   .help-hero h1 .wave {
       display: inline-block;
       animation: wave 2s ease-in-out infinite;
       transform-origin: 70% 70%;
   }

   @keyframes wave {
       0%, 100% { transform: rotate(0deg); }
       25% { transform: rotate(20deg); }
       75% { transform: rotate(-10deg); }
   }

   /* AI Search Box */
   .search-container {
       max-width: 600px;
       margin: 0 auto 20px;
   }

   .search-box {
       display: flex;
       align-items: center;
       background: #fff;
       border: 2px solid #e8e8e8;
       border-radius: 12px;
       padding: 12px 16px;
       transition: all 0.2s ease;
   }

   .search-box:focus-within {
       border-color: #ff6d04;
       box-shadow: 0 0 0 3px rgba(255, 109, 4, 0.1);
   }

   .search-box svg {
       width: 22px;
       height: 22px;
       fill: #888;
       margin-right: 12px;
       flex-shrink: 0;
   }

   .search-box input {
       flex: 1;
       border: none;
       background: transparent;
       font-size: 1.05rem;
       outline: none;
       color: #181a1b;
   }

   .search-box input::placeholder {
       color: #999;
   }

   .search-box .ai-badge {
       background: #ff6d04;
       color: #fff;
       font-size: 0.7rem;
       font-weight: 600;
       padding: 5px 12px;
       border-radius: 6px;
       text-transform: uppercase;
       letter-spacing: 0.5px;
       margin-left: 12px;
       flex-shrink: 0;
   }

   /* Quick Questions - Black/White Style, no orange hover */
   .quick-questions {
       display: flex;
       flex-wrap: wrap;
       gap: 10px;
       justify-content: center;
       margin-bottom: 16px;
   }

   .quick-q {
       background: #181a1b;
       border: none;
       border-radius: 20px;
       padding: 8px 16px;
       font-size: 0.9rem;
       color: #fff;
       cursor: pointer;
       transition: all 0.2s ease;
   }

   .quick-q:hover {
       background: #333;
   }

   /* Quick Action Pills - White with border */
   .action-pills {
       display: flex;
       gap: 12px;
       justify-content: center;
       flex-wrap: wrap;
       margin-top: 16px;
   }

   .action-pill {
       display: inline-flex;
       align-items: center;
       gap: 8px;
       background: #fff;
       border: 1px solid #e8e8e8;
       border-radius: 8px;
       padding: 10px 18px;
       font-size: 0.9rem;
       color: #181a1b;
       text-decoration: none;
       font-weight: 500;
       transition: all 0.2s ease;
   }

   .action-pill:hover {
       border-color: #ff6d04;
       color: #ff6d04;
   }

   .action-pill svg {
       width: 18px;
       height: 18px;
       fill: currentColor;
   }

   /* Popular Topics */
   .topics-section {
       padding: 10px 20px;
       max-width: 1100px;
       margin: 0 auto;
   }

   .topics-section h2 {
       font-size: 1.2rem;
       font-weight: 600;
       color: #181a1b;
       margin-bottom: 20px;
   }

   .topics-grid {
       display: grid;
       grid-template-columns: repeat(3, 1fr);
       gap: 14px;
   }

   .topic-card {
       background: #fff;
       border: 1px solid #e8e8e8;
       border-radius: 12px;
       padding: 20px;
       text-decoration: none;
       transition: all 0.2s ease;
   }

   .topic-card:hover {
       border-color: #ff6d04;
       transform: translateY(-2px);
       box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
   }

   .topic-card .icon {
       font-size: 1.6rem;
       margin-bottom: 10px;
   }

   .topic-card h3 {
       font-size: 1rem;
       font-weight: 600;
       color: #181a1b;
       margin-bottom: 4px;
   }

   .topic-card p {
       font-size: 0.85rem;
       color: #5d5e5f;
       line-height: 1.5;
   }

   /* What's New Section - Same white background */
   .whats-new {
       padding: 10px 20px;
       background: #ffffff;
       max-width: 1100px;
       margin: 0 auto;
   }

   .whats-new h2 {
       font-size: 1.2rem;
       font-weight: 600;
       color: #181a1b;
       margin-bottom: 20px;
   }

   .new-grid {
       display: grid;
       grid-template-columns: repeat(2, 1fr);
       gap: 16px;
   }

   .new-card {
       background: #fff;
       border-radius: 12px;
       overflow: hidden;
       text-decoration: none;
       border: 1px solid #e8e8e8;
       transition: all 0.2s ease;
   }

   .new-card:hover {
       transform: translateY(-3px);
       box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
   }

   .new-card .card-media {
       height: 140px;
       overflow: hidden;
       background: #f5f5f5;
   }

   .new-card .card-media video {
       width: 100%;
       height: 100%;
       object-fit: cover;
   }

   .new-card .card-content {
       padding: 16px;
   }

   .new-card .tag {
       display: inline-block;
       background: rgba(255, 109, 4, 0.1);
       color: #ff6d04;
       font-size: 0.7rem;
       font-weight: 600;
       padding: 4px 10px;
       border-radius: 4px;
       margin-bottom: 8px;
   }

   .new-card h3 {
       font-size: 0.95rem;
       font-weight: 600;
       color: #181a1b;
       margin-bottom: 4px;
   }

   .new-card p {
       font-size: 0.85rem;
       color: #5d5e5f;
       line-height: 1.4;
   }

   /* FiftyOne Academy */
   .quick-links {
       padding: 10px 20px;
       max-width: 1100px;
       margin: 0 auto;
   }

   .quick-links h2 {
       font-size: 1.2rem;
       font-weight: 600;
       color: #181a1b;
       margin-bottom: 20px;
   }

   .links-grid {
       display: grid;
       grid-template-columns: repeat(4, 1fr);
       gap: 10px;
   }

   .quick-link {
       display: flex;
       align-items: center;
       gap: 10px;
       padding: 12px 16px;
       background: #fff;
       border: 1px solid #e8e8e8;
       border-radius: 8px;
       text-decoration: none;
       transition: all 0.2s ease;
   }

   .quick-link:hover {
       border-color: #ff6d04;
   }

   .quick-link .emoji {
       font-size: 1.1rem;
   }

   .quick-link span {
       font-size: 0.85rem;
       color: #181a1b;
       font-weight: 500;
   }

   /* Visualize Section */
   .visualize-section {
       background: #fff;
       padding: 10px 20px;
       margin: 0 auto;
       display: grid;
       grid-template-columns: 1.2fr 1fr;
       gap: 40px;
       align-items: center;
       max-width: 1100px;
   }

   .visualize-content h2 {
       font-size: 1.8rem;
       font-weight: 700;
       color: #181a1b;
       margin-bottom: 16px;
       line-height: 1.2;
   }

   .visualize-content .lead {
       font-size: 1rem;
       color: #5d5e5f;
       line-height: 1.6;
       margin-bottom: 20px;
   }

   .visualize-content ul {
       list-style: none;
       padding: 0;
       margin: 0 0 24px 0;
   }

   .visualize-content ul li {
       color: #5d5e5f;
       font-size: 0.95rem;
       padding: 6px 0;
       padding-left: 20px;
       position: relative;
   }

   .visualize-content ul li::before {
       content: "•";
       color: #ff6d04;
       font-weight: bold;
       position: absolute;
       left: 0;
   }

   .visualize-media {
       border-radius: 12px;
       overflow: hidden;
       box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
   }

   .visualize-media video {
       width: 100%;
       height: auto;
       display: block;
   }

   /* Install Section */
   .install-section {
       background: #fff;
       padding: 20px 40px 40px;
       text-align: center;
       margin: 0 -20px;
   }

   .install-section h2 {
       color: #181a1b;
       font-size: 1.6rem;
       margin-bottom: 24px;
   }

   .install-command {
       display: inline-flex;
       align-items: center;
       gap: 16px;
       background: #181a1b;
       padding: 16px 24px;
       border-radius: 10px;
       margin-bottom: 24px;
       border: none;
   }

   .install-command code {
       font-family: 'Geist Mono', monospace;
       font-size: 1.1rem;
       color: #fff;
   }

   .install-command .copy-btn {
       background: #ff6d04;
       border: none;
       padding: 8px 16px;
       border-radius: 6px;
       color: #fff;
       font-weight: 600;
       cursor: pointer;
       transition: all 0.2s ease;
   }

   .install-command .copy-btn:hover {
       background: #e85a00;
   }

   .install-links {
       display: flex;
       gap: 24px;
       justify-content: center;
       flex-wrap: wrap;
   }

   .install-links a {
       color: #5d5e5f;
       text-decoration: none;
       font-size: 0.95rem;
       transition: color 0.3s ease;
   }

   .install-links a:hover {
       color: #ff6d04;
   }

   @media (max-width: 900px) {
       .topics-grid {
           grid-template-columns: repeat(2, 1fr);
       }
       .links-grid {
           grid-template-columns: repeat(2, 1fr);
       }
       .new-grid {
           grid-template-columns: 1fr;
       }
       .visualize-section {
           grid-template-columns: 1fr;
           padding: 40px 20px;
       }
   }

   @media (max-width: 600px) {
       .topics-grid, .links-grid {
           grid-template-columns: 1fr;
       }
       .help-hero h1 {
           font-size: 1.8rem;
       }
   }
   </style>

   <div class="help-hero">
       <div class="brand-line">FiftyOne Documentation</div>
       <h1><span class="wave">&#128075;</span> Hi, how can we help?</h1>

       <div class="search-container">
           <div class="search-box">
               <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
               <input type="text" id="ai-search-input" placeholder="Search or ask a question..." />
               <span class="ai-badge">Ask AI</span>
           </div>
       </div>

       <div class="quick-questions">
           <button class="quick-q" data-query="How do I install FiftyOne?">How do I install?</button>
           <button class="quick-q" data-query="How can I import my dataset?">Import my data</button>
           <button class="quick-q" data-query="How do I compute embeddings?">Compute embeddings</button>
           <button class="quick-q" data-query="How can I evaluate my model?">Evaluate my model</button>
       </div>

       <div class="action-pills">
           <a href="installation/index.html" class="action-pill">
               <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
               Installation
           </a>
           <a href="user_guide/import_datasets.html" class="action-pill">
               <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
               Import data
           </a>
           <a href="tutorials/evaluate_detections.html" class="action-pill">
               <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
               Evaluate models
           </a>
           <a href="plugins/index.html" class="action-pill">
               <svg viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
               Plugins
           </a>
       </div>
   </div>

   <div class="topics-section">
       <h2>Popular Topics</h2>
       <div class="topics-grid">
           <a href="getting_started/index.html" class="topic-card">
               <div class="icon">&#127891;</div>
               <h3>Getting Started</h3>
               <p>New here? Choose a guided learning path for your use case.</p>
           </a>
           <a href="user_guide/app.html" class="topic-card">
               <div class="icon">&#128421;</div>
               <h3>App</h3>
               <p>Explore the visual interface for browsing datasets and predictions.</p>
           </a>
           <a href="brain.html" class="topic-card">
               <div class="icon">&#129504;</div>
               <h3>Brain</h3>
               <p>ML-powered insights: embeddings, uniqueness, and label mistakes.</p>
           </a>
           <a href="dataset_zoo/index.html" class="topic-card">
               <div class="icon">&#128230;</div>
               <h3>Dataset Zoo</h3>
               <p>Access 100+ popular datasets including COCO, ImageNet, and more.</p>
           </a>
           <a href="model_zoo/index.html" class="topic-card">
               <div class="icon">&#129302;</div>
               <h3>Model Zoo</h3>
               <p>Pre-trained models for detection, classification, and embeddings.</p>
           </a>
           <a href="plugins/index.html" class="topic-card">
               <div class="icon">&#128268;</div>
               <h3>Plugins</h3>
               <p>Extend with custom panels and integrations.</p>
           </a>
       </div>
   </div>

   <div class="whats-new">
       <h2>What's New</h2>
       <div class="new-grid">
           <a href="release-notes.html" class="new-card">
               <div class="card-media">
                   <video autoplay loop muted playsinline>
                       <source src="https://github.com/user-attachments/assets/246faeb7-dcab-4e01-9357-e50f6b106da7" type="video/mp4">
                   </video>
               </div>
               <div class="card-content">
                   <span class="tag">Latest Release</span>
                   <h3>See What's New</h3>
                   <p>Explore the latest features, improvements, and bug fixes.</p>
               </div>
           </a>
           <a href="enterprise/index.html" class="new-card">
               <div class="card-media">
                   <video autoplay loop muted playsinline>
                       <source src="https://github.com/user-attachments/assets/9dc2db88-967d-43fa-bda0-85e4d5ab6a7a" type="video/mp4">
                   </video>
               </div>
               <div class="card-content">
                   <span class="tag">Enterprise</span>
                   <h3>Enterprise Edition</h3>
                   <p>Team collaboration, cloud deployment, and advanced workflows.</p>
               </div>
           </a>
       </div>
   </div>

   <div class="visualize-section">
       <div class="visualize-content">
           <h2>Visualize your data like never before</h2>
           <p class="lead">Identify your best performing samples, weed out low-quality data, and organize dataset views intuitively — so you can focus on building better models, faster.</p>
           <ul>
               <li>Unify multimodal data (3D, video, images, metadata)</li>
               <li>Slice, search, and filter massive datasets</li>
               <li>Analyze data patterns with embeddings</li>
               <li>Improve data quality with automatic filters</li>
               <li>Query data lake and retrieve relevant samples</li>
           </ul>
           <a href="user_guide/app.html" class="sd-btn sd-btn-primary book-a-demo" style="width: fit-content; --cta-arrow-shift: 100px; --cta-text-shift: -34px;">
               <div class="arrow">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <path stroke="currentColor" stroke-width="1.5" d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937" vector-effect="non-scaling-stroke"></path>
                   </svg>
               </div>
               <div class="text">Learn more</div>
           </a>
       </div>
       <div class="visualize-media">
           <video id="visualize-video" autoplay loop muted playsinline poster="https://image.mux.com/5Qj01oFjAXMcndcpmm5m2z01lH1iJSdWfK6V2YskG4ooA/thumbnail.jpg?time=0" style="width: 100%; height: auto; object-fit: cover;"></video>
       </div>
   </div>

   <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
   <script>
   document.addEventListener('DOMContentLoaded', function() {
       var video = document.getElementById('visualize-video');
       var videoSrc = 'https://stream.mux.com/5Qj01oFjAXMcndcpmm5m2z01lH1iJSdWfK6V2YskG4ooA.m3u8';

       if (Hls.isSupported()) {
           var hls = new Hls();
           hls.loadSource(videoSrc);
           hls.attachMedia(video);
           hls.on(Hls.Events.MANIFEST_PARSED, function() {
               video.play();
           });
       } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
           video.src = videoSrc;
           video.addEventListener('loadedmetadata', function() {
               video.play();
           });
       }
   });
   </script>

   <div class="quick-links">
       <h2>FiftyOne Academy</h2>
       <div class="links-grid">
           <a href="tutorials/index.html" class="quick-link">
               <span class="emoji">&#128218;</span>
               <span>Tutorials</span>
           </a>
           <a href="recipes/index.html" class="quick-link">
               <span class="emoji">&#127859;</span>
               <span>Recipes</span>
           </a>
           <a href="cheat_sheets/index.html" class="quick-link">
               <span class="emoji">&#128203;</span>
               <span>Cheat Sheets</span>
           </a>
           <a href="user_guide/index.html" class="quick-link">
               <span class="emoji">&#128214;</span>
               <span>User Guide</span>
           </a>
           <a href="api/fiftyone.html" class="quick-link">
               <span class="emoji">&#128187;</span>
               <span>API Reference</span>
           </a>
           <a href="integrations/index.html" class="quick-link">
               <span class="emoji">&#128279;</span>
               <span>Integrations</span>
           </a>
           <a href="cli/index.html" class="quick-link">
               <span class="emoji">&#9000;</span>
               <span>CLI Reference</span>
           </a>
           <a href="faq/index.html" class="quick-link">
               <span class="emoji">&#10067;</span>
               <span>FAQ</span>
           </a>
       </div>
   </div>

   <div class="install-section">
       <h2>Ready to dive in?</h2>
       <div class="install-command">
           <code>pip install fiftyone</code>
           <button class="copy-btn" onclick="navigator.clipboard.writeText('pip install fiftyone')">Copy</button>
       </div>
       <div class="install-links">
           <a href="installation/index.html">Installation Guide</a>
           <a href="https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb" target="_blank">Try in Colab</a>
           <a href="https://github.com/voxel51/fiftyone" target="_blank">View on GitHub</a>
           <a href="https://community.voxel51.com" target="_blank">Join Discord</a>
       </div>
   </div>

   <script>
   document.addEventListener('DOMContentLoaded', function() {
       const searchInput = document.getElementById('ai-search-input');
       const quickQs = document.querySelectorAll('.quick-q');

       const askKapa = (query) => {
           if (window.Kapa) {
               window.Kapa.open({ mode: 'ai', query: query, submit: true });
           } else {
               setTimeout(() => {
                   if (window.Kapa) {
                       window.Kapa.open({ mode: 'ai', query: query, submit: true });
                   }
               }, 1000);
           }
       };

       searchInput.addEventListener('keypress', (e) => {
           if (e.key === 'Enter') {
               const query = searchInput.value.trim();
               if (query) {
                   askKapa(query);
               } else if (window.Kapa) {
                   window.Kapa.open();
               }
           }
       });

       quickQs.forEach(btn => {
           btn.addEventListener('click', () => {
               const query = btn.dataset.query;
               askKapa(query);
           });
       });
   });
   </script>

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   FiftyOne Enterprise <enterprise/index>
   Installation <installation/index>
   Getting Started <getting_started/index>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   Cheat Sheets <cheat_sheets/index>
   User Guide <user_guide/index>
   Dataset Zoo <dataset_zoo/index>
   Model Zoo <model_zoo/index>
   FiftyOne Brain <brain>
   Plugins <plugins/index>
   Integrations <integrations/index>
   CLI <cli/index>
   API Reference <api/fiftyone>
   Contribute <contribute/index>
   Release Notes <release-notes>
   Deprecation Notices <deprecation>
   FAQ <faq/index>
