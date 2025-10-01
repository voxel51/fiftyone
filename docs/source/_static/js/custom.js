/* Responsive Sidebar */
function initSidebarToggle() {
  const primaryToggle = document.querySelector(".primary-sidebar-toggle");
  const toggleIcon = document.querySelector(".primary-toggle-icon");
  let originalSidebarContent = null;

  const cutAndPasteNodesAndClasses = (from, to) => {
    to.innerHTML = "";
    to.className = "";
    Array.from(from.childNodes).forEach((node) => {
      to.appendChild(node.cloneNode(true));
    });
    Array.from(from.classList).forEach((cls) => {
      to.classList.add(cls);
    });
  };

  const convertDropdownItemsToNavItems = (dropdownItems) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = dropdownItems;

    const listItems = tempDiv.querySelectorAll("li");
    listItems.forEach((li) => {
      const navItem = document.createElement("div");
      navItem.className = "nav-item";
      navItem.innerHTML = li.innerHTML;
      li.parentNode.replaceChild(navItem, li);
    });

    const ulElements = tempDiv.querySelectorAll("ul");
    ulElements.forEach((ul) => {
      while (ul.firstChild) {
        ul.parentNode.insertBefore(ul.firstChild, ul);
      }
      ul.remove();
    });

    return tempDiv.innerHTML;
  };

  const addDropdownIcons = async () => {
    const primaryDialog = document.getElementById("pst-primary-sidebar-modal");
    if (!primaryDialog) return;

    let svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
        <path stroke="currentColor" stroke-width="1.5" d="M21.844 6.844 12 16.687 2.156 6.845" vector-effect="non-scaling-stroke"></path>
      </svg>
    `;

    const dropdownItems = primaryDialog.querySelectorAll(
      "div.nav-item.dropdown"
    );

    dropdownItems.forEach((navItem) => {
      const dropdownToggle = navItem.querySelector(
        "a.nav-link.dropdown-toggle"
      );
      if (dropdownToggle) {
        const existingIcon =
          dropdownToggle.parentNode.querySelector(".dropdown-arrow");
        if (!existingIcon) {
          const iconContainer = document.createElement("span");
          iconContainer.className = "arrow dropdown-arrow";
          iconContainer.innerHTML = svgContent;

          dropdownToggle.parentNode.insertBefore(
            iconContainer,
            dropdownToggle.nextSibling
          );
        }
      }
    });
  };

  const showDropdownContent = (dropdownItems) => {
    const primaryDialog = document.getElementById("pst-primary-sidebar-modal");
    if (!primaryDialog) return;

    const convertedItems = convertDropdownItemsToNavItems(dropdownItems);
    const dropdownHTML = `
      <div class="dropdown-nav-container">
        <div class="dropdown-items-container">
          <div class="nav-item">
            <a href="#" class="dropdown-back-btn dropdown-item">
              <span class="arrow">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="back-arrow">
                  <path stroke="currentColor" stroke-width="1.5" d="M21.844 6.844 12 16.687 2.156 6.845" vector-effect="non-scaling-stroke"></path>
                </svg>
              </span>
              <span class="back-text">Back</span>
            </a>
          </div>
          ${convertedItems}
        </div>
      </div>
    `;

    primaryDialog.innerHTML = dropdownHTML;

    const backBtn = primaryDialog.querySelector(".dropdown-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", async () => {
        if (originalSidebarContent) {
          primaryDialog.innerHTML = originalSidebarContent;
          await addDropdownIcons();
          initDropdownListeners();
        }
      });
    }
  };

  const initDropdownListeners = () => {
    const primaryDialog = document.getElementById("pst-primary-sidebar-modal");
    if (!primaryDialog) return;

    const dropdowns = primaryDialog.querySelectorAll(".nav-item.dropdown");

    dropdowns.forEach((dropdown) => {
      const toggle = dropdown.querySelector(".dropdown-toggle");
      const menu = dropdown.querySelector(".dropdown-menu");

      if (!toggle || !menu) return;

      const newDropdown = dropdown.cloneNode(true);
      dropdown.parentNode.replaceChild(newDropdown, dropdown);

      newDropdown.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const dropdownToggle = newDropdown.querySelector(".dropdown-toggle");
        const dropdownMenu = newDropdown.querySelector(".dropdown-menu");

        if (dropdownToggle && dropdownMenu) {
          const dropdownItems = dropdownMenu.innerHTML;

          showDropdownContent(dropdownItems);
        }
      });
    });
  };

  if (!primaryToggle) return;

  primaryToggle.addEventListener("click", async (event) => {
    const primaryDialog = document.getElementById("pst-primary-sidebar-modal");
    const primarySidebar = document.getElementById("pst-primary-sidebar");
    event.preventDefault();
    event.stopPropagation();

    if (toggleIcon) {
      toggleIcon.classList.toggle("active");

      const isExpanded = primaryToggle.getAttribute("aria-expanded") === "true";
      primaryToggle.setAttribute("aria-expanded", !isExpanded);
    }

    if (primaryDialog) {
      if (primaryDialog.open) {
        primaryDialog.close();
        document.body.style.overflow = "";
      } else {
        cutAndPasteNodesAndClasses(primarySidebar, primaryDialog);

        await addDropdownIcons();

        originalSidebarContent = primaryDialog.innerHTML;

        primaryDialog.show();
        document.body.style.overflow = "hidden";

        initDropdownListeners();
      }
    }
  });
}

/* Sliding Navbar */
function initSlidingNavBar() {
  const navbarNav =
    document.querySelector(".navbar-header-items__center .navbar-nav") ||
    document.querySelector(".navbar-nav");
  if (!navbarNav || window.innerWidth < 960) return;

  const navItems = navbarNav.querySelectorAll(".nav-item");
  if (!navItems.length) return;

  let slidingBar = navbarNav.querySelector(".sliding-bar-indicator");
  let barTimeout = null;

  if (!slidingBar) {
    slidingBar = document.createElement("div");
    slidingBar.className = "sliding-bar-indicator";
    slidingBar.style.cssText = `position: absolute; bottom: 0; left: 0; width: 0; height: 1px; background-color: #000; transition: all 0.3s ease; opacity: 0; z-index: 1; pointer-events: none;`;
    navbarNav.appendChild(slidingBar);
  }

  const updateSlidingBar = (targetItem) => {
    if (barTimeout) {
      clearTimeout(barTimeout);
      barTimeout = null;
    }

    const left = targetItem.offsetLeft;
    const width = targetItem.offsetWidth;

    if (slidingBar.style.opacity === "0" || slidingBar.style.opacity === "") {
      slidingBar.style.transition = "none";
      slidingBar.style.left = `${left}px`;
      slidingBar.style.width = `${width}px`;
      requestAnimationFrame(() => {
        slidingBar.style.transition = "all 0.3s ease";
        slidingBar.style.opacity = "1";
      });
    } else {
      slidingBar.style.left = `${left}px`;
      slidingBar.style.width = `${width}px`;
      slidingBar.style.opacity = "1";
    }
  };

  const scheduleHideBar = () => {
    if (barTimeout) clearTimeout(barTimeout);
    barTimeout = setTimeout(() => {
      slidingBar.style.opacity = "0";
      barTimeout = null;
    }, 500);
  };

  navItems.forEach((navItem) =>
    navItem.addEventListener("mouseenter", () => updateSlidingBar(navItem))
  );
  navbarNav.addEventListener("mouseleave", scheduleHideBar);
  window.addEventListener("resize", () => {
    if (window.innerWidth < 960) slidingBar.style.opacity = "0";
  });
}

/* Dropdown Delay System */
function initDropdownDelay() {
  if (window.innerWidth < 960) return;

  const dropdowns = document.querySelectorAll(".dropdown");
  let activeDropdown = null;
  let allTimeouts = new Map();

  const toggleDropdownItems = (dropdownMenu, show) => {
    const items = dropdownMenu.querySelectorAll(".dropdown-item");
    items.forEach((item, index) => {
      if (show) {
        setTimeout(() => {
          item.style.opacity = "1";
          item.style.transform = "translateY(0)";
          item.style.animation = "fadeInUp 0.3s ease-out forwards";
        }, index * 30);
      } else {
        item.style.opacity = "0";
        item.style.transform = "translateY(10px)";
        item.style.animation = "none";
      }
    });
  };

  const closeAllDropdowns = (except = null) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown !== except) {
        const timeout = allTimeouts.get(dropdown);
        if (timeout) {
          clearTimeout(timeout);
          allTimeouts.delete(dropdown);
        }
        const dropdownMenu = dropdown.querySelector(".dropdown-menu");
        if (dropdownMenu) {
          toggleDropdownItems(dropdownMenu, false);
          dropdownMenu.style.opacity = "0";
          dropdownMenu.style.visibility = "hidden";
          dropdownMenu.style.transform = "translateY(-10px) scale(0.95)";
        }
      }
    });
  };

  const showDropdown = (dropdown) => {
    if (activeDropdown && activeDropdown !== dropdown) {
      closeAllDropdowns(dropdown);
    }

    const timeout = allTimeouts.get(dropdown);
    if (timeout) {
      clearTimeout(timeout);
      allTimeouts.delete(dropdown);
    }

    activeDropdown = dropdown;
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");
    if (dropdownMenu) {
      dropdownMenu.style.opacity = "1";
      dropdownMenu.style.visibility = "visible";
      dropdownMenu.style.transform = "translateY(0) scale(1)";
      dropdownMenu.style.display = "block";
      toggleDropdownItems(dropdownMenu, true);
    }
  };

  const hideDropdown = (dropdown) => {
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");
    if (dropdownMenu) {
      toggleDropdownItems(dropdownMenu, false);
      dropdownMenu.style.opacity = "0";
      dropdownMenu.style.visibility = "hidden";
      dropdownMenu.style.transform = "translateY(-10px) scale(0.95)";
    }
    if (activeDropdown === dropdown) activeDropdown = null;
  };

  const scheduleHide = (dropdown) => {
    const existingTimeout = allTimeouts.get(dropdown);
    if (existingTimeout) clearTimeout(existingTimeout);

    const newTimeout = setTimeout(() => {
      hideDropdown(dropdown);
      allTimeouts.delete(dropdown);
    }, 500);

    allTimeouts.set(dropdown, newTimeout);
  };

  dropdowns.forEach((dropdown) => {
    dropdown.addEventListener("mouseenter", () => showDropdown(dropdown));
    dropdown.addEventListener("mouseleave", () => scheduleHide(dropdown));

    const dropdownMenu = dropdown.querySelector(".dropdown-menu");
    if (dropdownMenu) {
      dropdownMenu.addEventListener("mouseenter", () => showDropdown(dropdown));
      dropdownMenu.addEventListener("mouseleave", () => scheduleHide(dropdown));
    }
  });

  document
    .querySelectorAll(".navbar-header-items__center .nav-item")
    .forEach((navItem) => {
      if (!navItem.classList.contains("dropdown")) {
        navItem.addEventListener("mouseenter", () => {
          if (activeDropdown) {
            closeAllDropdowns();
            activeDropdown = null;
          }
        });
      }
    });

  window.addEventListener("resize", () => {
    if (window.innerWidth < 960) {
      closeAllDropdowns();
      activeDropdown = null;

      dropdowns.forEach((dropdown) => {
        const dropdownMenu = dropdown.querySelector(".dropdown-menu");
        if (dropdownMenu) {
          dropdownMenu.style.opacity = "";
          dropdownMenu.style.visibility = "";
          dropdownMenu.style.transform = "";
          dropdownMenu.style.display = "";

          const dropdownItems = dropdownMenu.querySelectorAll(".dropdown-item");
          dropdownItems.forEach((item) => {
            item.style.opacity = "";
            item.style.transform = "";
            item.style.animation = "";
          });
        }
      });
    }
  });
}

/* Mark Line Numbers */
function markLineNumbers() {
  const preElements = document.querySelectorAll("pre");

  preElements.forEach((pre) => {
    const lineNumbers = pre.querySelectorAll("span.linenos");

    if (lineNumbers.length > 0) {
      lineNumbers[0].classList.add("first-linenos");
      lineNumbers[lineNumbers.length - 1].classList.add("last-linenos");
    }
  });
}

/* Tabs Sliding Indicator */
function initTabsSlidingIndicator() {
  const tabLists = document.querySelectorAll('[role="tablist"]');

  tabLists.forEach((tabList) => {
    const tabs = tabList.querySelectorAll(".sphinx-tabs-tab");
    if (!tabs.length) return;

    let slidingIndicator = tabList.querySelector(".tabs-sliding-indicator");

    if (!slidingIndicator) {
      slidingIndicator = document.createElement("div");
      slidingIndicator.className = "tabs-sliding-indicator";
      tabList.appendChild(slidingIndicator);
    }

    const updateIndicator = () => {
      const activeTab = tabList.querySelector(
        '.sphinx-tabs-tab[aria-selected="true"]'
      );
      if (activeTab) {
        const left = activeTab.offsetLeft;
        const width = activeTab.offsetWidth;

        slidingIndicator.style.left = `${left}px`;
        slidingIndicator.style.width = `${width}px`;
        slidingIndicator.style.opacity = "1";
      } else {
        slidingIndicator.style.opacity = "0";
      }
    };

    updateIndicator();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "aria-selected"
        ) {
          updateIndicator();
        }
      });
    });

    tabs.forEach((tab) => {
      observer.observe(tab, { attributes: true });
    });

    tabs.forEach((tab) => {
      tab.addEventListener(
        "click",
        (event) => {
          const isActive = tab.getAttribute("aria-selected") === "true";
          if (isActive) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return false;
          }
          setTimeout(() => {
            updateIndicator();
          }, 10);
        },
        true
      );
    });

    window.addEventListener("resize", updateIndicator);
  });
}

/* Mobile Navigation Dropdown */
function initMobileNavDropdown() {
  const dropdownToggle = document.getElementById("mobile-nav-dropdown-toggle");
  const dropdown = document.getElementById("mobile-nav-dropdown");

  if (!dropdownToggle || !dropdown) {
    return;
  }

  function openDropdown() {
    dropdown.classList.add("open");
    dropdownToggle.setAttribute("aria-expanded", "true");
    dropdown.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDropdown() {
    dropdown.classList.remove("open");
    dropdownToggle.setAttribute("aria-expanded", "false");
    dropdown.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function toggleDropdown() {
    const isOpen = dropdown.classList.contains("open");

    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  dropdownToggle.addEventListener("click", function (e) {
    e.preventDefault();
    toggleDropdown();
  });

  document.addEventListener("click", function (e) {
    if (!dropdownToggle.contains(e.target) && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebarToggle();
  initSlidingNavBar();
  initDropdownDelay();
  markLineNumbers();
  initTabsSlidingIndicator();
  initMobileNavDropdown();
});

document.addEventListener("DOMContentLoaded", function () {
  var script = document.createElement("script");
  script.src = "https://widget.kapa.ai/kapa-widget.bundle.js";
  script.setAttribute(
    "data-website-id",
    "eb6a5a18-9704-41fc-9351-cae28372e763"
  );
  script.setAttribute("data-project-name", "Voxel51");
  script.setAttribute("data-project-color", "#212529");
  script.setAttribute(
    "data-project-logo",
    "https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png"
  );
  script.async = true;
  document.head.appendChild(script);
});
