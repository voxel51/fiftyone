window.filterTags = {
  bind: function() {
    var options = {
      valueNames: [{ data: ["tags"] }],
      page: "6",
      pagination: true
    };

    var tutorialList = new List("tutorial-cards", options);

    function filterSelectedTags(cardTags, selectedTags) {
      return cardTags.some(function(tag) {
        return selectedTags.some(function(selectedTag) {
          return selectedTag == tag;
        });
      });
    }

    function updateList() {
      var selectedTags = [];

      $(".selected").each(function() {
        selectedTags.push($(this).data("tag"));
      });

      tutorialList.filter(function(item) {
        var cardTags;

        if (item.values().tags == null) {
          cardTags = [""];
        } else {
          cardTags = item.values().tags.split(",");
        }

        if (selectedTags.length == 0) {
          return true;
        } else {
          return filterSelectedTags(cardTags, selectedTags);
        }
      });
    }

    $(".filter-btn").on("click", function() {
      if ($(this).data("tag") == "all") {
        $(this).addClass("all-tag-selected");
        $(".filter").removeClass("selected");
      } else {
        $(this).toggleClass("selected");
        $("[data-tag='all']").removeClass("all-tag-selected");
      }

      // If no tags are selected then highlight the 'All' tag

      if (!$(".selected")[0]) {
        $("[data-tag='all']").addClass("all-tag-selected");
      }

      updateList();
    });
  }
};
