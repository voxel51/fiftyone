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
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = dropdownItems;
    
    const listItems = tempDiv.querySelectorAll('li');
    listItems.forEach(li => {
      const navItem = document.createElement('div');
      navItem.className = 'nav-item';
      navItem.innerHTML = li.innerHTML;
      li.parentNode.replaceChild(navItem, li);
    });
    
    const ulElements = tempDiv.querySelectorAll('ul');
    ulElements.forEach(ul => {
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

    let svgContent = '';
    try {
      const response = await fetch('/_static/images/icons/arrow-icon.svg');
      if (response.ok) {
        svgContent = await response.text();
      }
    } catch (error) {
      console.warn('No se pudo cargar el SVG:', error);
      return;
    }

    const dropdownItems = primaryDialog.querySelectorAll('div.nav-item.dropdown');
    
    dropdownItems.forEach(navItem => {
      const dropdownToggle = navItem.querySelector('a.nav-link.dropdown-toggle');
      if (dropdownToggle) {
        const existingIcon = dropdownToggle.parentNode.querySelector('.dropdown-arrow');
        if (!existingIcon) {
          const iconContainer = document.createElement('span');
          iconContainer.className = 'arrow dropdown-arrow';
          iconContainer.innerHTML = svgContent;
          
          dropdownToggle.parentNode.insertBefore(iconContainer, dropdownToggle.nextSibling);
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
              <span class="arrow back-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M11.25 6H1.25M1.25 6L6 1.25M1.25 6L6 10.75" stroke="#181A1B99" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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

    const backBtn = primaryDialog.querySelector('.dropdown-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
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

    const dropdowns = primaryDialog.querySelectorAll('.nav-item.dropdown');
    
    dropdowns.forEach(dropdown => {
      const toggle = dropdown.querySelector('.dropdown-toggle');
      const menu = dropdown.querySelector('.dropdown-menu');
      
      if (!toggle || !menu) return;

      const newDropdown = dropdown.cloneNode(true);
      dropdown.parentNode.replaceChild(newDropdown, dropdown);

      newDropdown.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const dropdownToggle = newDropdown.querySelector('.dropdown-toggle');
        const dropdownMenu = newDropdown.querySelector('.dropdown-menu');
        
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
      toggleIcon.classList.toggle('active');
      
      const isExpanded = primaryToggle.getAttribute('aria-expanded') === 'true';
      primaryToggle.setAttribute('aria-expanded', !isExpanded);
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

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle()
})