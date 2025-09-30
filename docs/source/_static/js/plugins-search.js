(function () {
  function updateAllCount() {
    var allButton = document.querySelector('.tutorial-filter[data-tag="all"]');
    if (allButton) {
      var count = document.querySelectorAll(".tutorials-card-container").length;
      allButton.textContent = `All`;
    }
  }

  function bindSearch() {
    var searchInput = document.getElementById("plugin-search");
    if (!searchInput || !window.tutorialList) return;

    var tutorialList = window.tutorialList;

    function applyFilters() {
      var selectedTags = [];
      document.querySelectorAll(".filter-btn.selected").forEach(function (el) {
        selectedTags.push(el.getAttribute("data-tag"));
      });

      var searchTerm = (searchInput.value || "").toLowerCase().trim();

      tutorialList.filter(function (item) {
        var values = item.values();
        var cardTags = values.tags ? values.tags.split(",") : [""];
        var matchesTags =
          selectedTags.length === 0 ||
          cardTags.some(function (tag) {
            return selectedTags.indexOf(tag) !== -1;
          });
        if (!matchesTags) return false;
        if (!searchTerm) return true;

        var elm = item.elm;
        if (!elm) return false;
        var header = (
          elm.querySelector(".card-title-container strong")?.textContent || ""
        ).toLowerCase();
        var description = (
          elm.querySelector(".card-summary")?.textContent || ""
        ).toLowerCase();
        var tagsText = (
          elm.querySelector(".tags")?.textContent || ""
        ).toLowerCase();
        var author = (
          elm.querySelector(".card-subtitle")?.textContent || ""
        ).toLowerCase();
        var searchableText =
          header + " " + description + " " + tagsText + " " + author;
        return searchableText.indexOf(searchTerm) !== -1;
      });

      updateAllCount();
    }

    searchInput.addEventListener("input", applyFilters);

    var allButton = document.querySelector('.tutorial-filter[data-tag="all"]');
    if (allButton) {
      allButton.addEventListener("click", function () {
        searchInput.value = "";
        applyFilters();
      });
    }

    applyFilters();
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindSearch();
  });
})();
