FiftyOne
========

.. raw:: html

   <!-- OPTION 2: Use-Case Centric (User-Oriented) -->
   <!-- Based on what you're working on - choose your path -->

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

   .usecase-hero {
       text-align: center;
       padding: 60px 20px 50px;
       background: #ffffff;
       margin: -20px -20px 0 -20px;
   }

   .usecase-hero .tagline {
       font-size: 0.85rem;
       font-weight: 600;
       color: #ff6d04;
       text-transform: uppercase;
       letter-spacing: 2px;
       margin-bottom: 16px;
   }

   .usecase-hero h1 {
       font-size: 3rem;
       font-weight: 700;
       color: #181a1b;
       margin-bottom: 16px;
       line-height: 1.2;
       display: block !important;
   }

   .usecase-hero h1 span {
       color: #ff6d04;
   }

   .usecase-hero p {
       font-size: 1.2rem;
       color: #5d5e5f;
       max-width: 700px;
       margin: 0 auto 20px;
   }

   .usecase-question {
       font-size: 1.6rem;
       font-weight: 600;
       color: #181a1b;
       margin: 40px 0 30px;
   }

   .usecase-grid {
       display: grid;
       grid-template-columns: repeat(2, 1fr);
       gap: 24px;
       max-width: 1000px;
       margin: 0 auto 40px;
       padding: 0 20px;
   }

   .usecase-card {
       background: #fff;
       border-radius: 16px;
       overflow: hidden;
       box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
       border: 1px solid #e8e8e8;
       transition: all 0.3s ease;
       text-decoration: none;
       display: block;
   }

   .usecase-card:hover {
       transform: translateY(-4px);
       box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
       border-color: #ff6d04;
   }

   .usecase-preview {
       height: 180px;
       overflow: hidden;
       position: relative;
       background: #f5f5f5;
   }

   .usecase-preview img,
   .usecase-preview video {
       width: 100%;
       height: 100%;
       object-fit: cover;
       transition: transform 0.4s ease;
   }

   .usecase-card:hover .usecase-preview img,
   .usecase-card:hover .usecase-preview video {
       transform: scale(1.05);
   }

   .usecase-preview .badge {
       position: absolute;
       top: 12px;
       left: 12px;
       background: #ff6d04;
       color: #fff;
       padding: 6px 12px;
       border-radius: 6px;
       font-size: 0.75rem;
       font-weight: 600;
       text-transform: uppercase;
       letter-spacing: 0.5px;
   }

   .usecase-content {
       padding: 24px;
   }

   .usecase-content h3 {
       font-size: 1.2rem;
       font-weight: 700;
       color: #181a1b;
       margin-bottom: 10px;
   }

   .usecase-content p {
       font-size: 0.95rem;
       color: #5d5e5f;
       line-height: 1.6;
       margin-bottom: 16px;
   }

   .usecase-meta {
       display: flex;
       gap: 16px;
       font-size: 0.85rem;
       color: #888;
   }

   .usecase-meta span {
       display: flex;
       align-items: center;
       gap: 6px;
   }

   .usecase-meta svg {
       width: 16px;
       height: 16px;
       fill: #888;
   }

   .usecase-cta {
       display: flex;
       align-items: center;
       justify-content: space-between;
       margin-top: 16px;
       padding-top: 16px;
       border-top: 1px solid #eee;
   }

   .usecase-cta span {
       color: #ff6d04;
       font-weight: 600;
       font-size: 0.95rem;
   }

   .usecase-cta svg {
       width: 20px;
       height: 20px;
       fill: #ff6d04;
       transition: transform 0.3s ease;
   }

   .usecase-card:hover .usecase-cta svg {
       transform: translateX(6px);
   }

   /* More Ways to Learn */
   .more-paths {
       padding: 20px 20px;
       background: #f8f8f8;
       margin: 0 -20px;
   }

   .more-paths h2 {
       font-size: 1.5rem;
       text-align: center;
       color: #181a1b;
       margin-bottom: 30px;
   }

   .paths-grid {
       display: grid;
       grid-template-columns: repeat(4, 1fr);
       gap: 16px;
       max-width: 1000px;
       margin: 0 auto;
   }

   .path-link {
       display: flex;
       align-items: center;
       gap: 12px;
       padding: 16px 20px;
       background: #fff;
       border-radius: 10px;
       text-decoration: none;
       color: #181a1b;
       font-weight: 500;
       transition: all 0.3s ease;
       border: 1px solid #e8e8e8;
   }

   .path-link:hover {
       background: #ff6d04;
       color: #fff;
       border-color: #ff6d04;
   }

   .path-link svg {
       width: 20px;
       height: 20px;
       fill: currentColor;
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
       .usecase-grid {
           grid-template-columns: 1fr;
       }
       .paths-grid {
           grid-template-columns: repeat(2, 1fr);
       }
       .visualize-section {
           grid-template-columns: 1fr;
           padding: 40px 20px;
       }
   }

   @media (max-width: 600px) {
       .usecase-hero h1 {
           font-size: 2rem;
       }
       .paths-grid {
           grid-template-columns: 1fr;
       }
   }
   </style>

   <div class="usecase-hero">
       <div class="tagline">Open Source Computer Vision Toolkit</div>
       <h1>Build Better <span>Computer Vision</span><br>with FiftyOne</h1>
       <p>Curate high-quality datasets, evaluate models, find mistakes, and visualize embeddings.</p>

       <h2 class="usecase-question">What are you working on?</h2>
   </div>

   <div class="usecase-grid">
       <a href="getting_started/medical_imaging/index.html" class="usecase-card">
           <div class="usecase-preview">
               <video autoplay loop muted playsinline poster="https://image.mux.com/5Qj01oFjAXMcndcpmm5m2z01lH1iJSdWfK6V2YskG4ooA/thumbnail.jpg?time=0">
                   <source src="https://github.com/user-attachments/assets/9dc2db88-967d-43fa-bda0-85e4d5ab6a7a" type="video/mp4">
               </video>
               <span class="badge">Healthcare</span>
           </div>
           <div class="usecase-content">
               <h3>Medical Imaging</h3>
               <p>Work with DICOM files, CT scans, MRIs, and volumetric data. Built-in support for medical imaging formats and 3D visualization.</p>
               <div class="usecase-meta">
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                       15-25 min
                   </span>
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
                       Beginner
                   </span>
               </div>
               <div class="usecase-cta">
                   <span>Start the guide</span>
                   <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
               </div>
           </div>
       </a>

       <a href="getting_started/self_driving/index.html" class="usecase-card">
           <div class="usecase-preview">
               <video autoplay loop muted playsinline>
                   <source src="https://github.com/user-attachments/assets/246faeb7-dcab-4e01-9357-e50f6b106da7" type="video/mp4">
               </video>
               <span class="badge">Automotive</span>
           </div>
           <div class="usecase-content">
               <h3>Autonomous Vehicles</h3>
               <p>Sensor fusion, LiDAR point clouds, camera feeds, and trajectory analysis. Everything you need for self-driving workflows.</p>
               <div class="usecase-meta">
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                       20-30 min
                   </span>
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
                       Beginner
                   </span>
               </div>
               <div class="usecase-cta">
                   <span>Start the guide</span>
                   <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
               </div>
           </div>
       </a>

       <a href="getting_started/object_detection/index.html" class="usecase-card">
           <div class="usecase-preview">
               <video autoplay loop muted playsinline>
                   <source src="https://github.com/user-attachments/assets/8c32d6c4-51e7-4fea-9a3c-2ffd9690f5d6" type="video/mp4">
               </video>
               <span class="badge">Detection</span>
           </div>
           <div class="usecase-content">
               <h3>Object Detection</h3>
               <p>Bounding boxes, instance segmentation, and detection model evaluation. YOLO, Faster R-CNN, and more.</p>
               <div class="usecase-meta">
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                       15-20 min
                   </span>
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
                       Beginner
                   </span>
               </div>
               <div class="usecase-cta">
                   <span>Start the guide</span>
                   <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
               </div>
           </div>
       </a>

       <a href="getting_started/model_evaluation/index.html" class="usecase-card">
           <div class="usecase-preview">
               <video autoplay loop muted playsinline>
                   <source src="https://github.com/user-attachments/assets/24fa1960-c2dd-46ae-ae5f-d58b3b84cfe4" type="video/mp4">
               </video>
               <span class="badge">Evaluation</span>
           </div>
           <div class="usecase-content">
               <h3>Model Evaluation</h3>
               <p>Go beyond aggregate metrics. Visualize predictions, find failure modes, and understand where your models struggle.</p>
               <div class="usecase-meta">
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                       15-25 min
                   </span>
                   <span>
                       <svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
                       Beginner
                   </span>
               </div>
               <div class="usecase-cta">
                   <span>Start the guide</span>
                   <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
               </div>
           </div>
       </a>
   </div>

   <div class="more-paths">
       <h2>More Ways to Learn</h2>
       <div class="paths-grid">
           <a href="tutorials/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/></svg>
               Tutorials
           </a>
           <a href="recipes/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/></svg>
               Recipes
           </a>
           <a href="cheat_sheets/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
               Cheat Sheets
           </a>
           <a href="user_guide/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
               User Guide
           </a>
           <a href="dataset_zoo/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
               Dataset Zoo
           </a>
           <a href="model_zoo/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
               Model Zoo
           </a>
           <a href="plugins/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
               Plugins
           </a>
           <a href="integrations/index.html" class="path-link">
               <svg viewBox="0 0 24 24"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z"/></svg>
               Integrations
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
