// Initialize when document is ready
$(document).ready(function () {

  // Build an array from each tag that's present
  var tagList = $(".tutorials-card-container").map(function () {
    var tagsData = $(this).data("tags");
    if (tagsData) {
      return tagsData.split(",").map(function (item) {
        return item.trim();
      });
    }
    return [];
  }).get();

  function unique(value, index, self) {
    return self.indexOf(value) == index && value != ""
  }

  // Only return unique tags
  var tags = tagList.sort().filter(unique);

  // Add filter buttons to the top of the page for each tag
  function createTagMenu() {
    tags.forEach(function (item) {
      $(".tutorial-filter-menu").append(" <div class='tutorial-filter filter-btn filter' data-tag='" + item + "'>" + item + "</div>")
    })
  };

  createTagMenu();

  // Remove hyphens if they are present in the filter buttons
  $(".tags").each(function () {
    var tags = $(this).text().split(",");
    tags.forEach(function (tag, i) {
      tags[i] = tags[i].replace(/-/, ' ')
    })
    $(this).html(tags.join(", "));
  });

  // Remove hyphens if they are present in the card body
  $(".tutorial-filter").each(function () {
    var tag = $(this).text();
    $(this).html(tag.replace(/-/, ' '))
  })

  // Remove any empty p tags that Sphinx adds
  $("#tutorial-cards p").each(function (index, item) {
    if (!$(item).text().trim()) {
      $(item).remove();
    }
  });

  // Jump back to top on pagination click
  $(document).on("click", ".page", function () {
    var dropdownTarget = $("#dropdown-filter-tags");
    if (dropdownTarget.length) {
      $('html, body').animate(
        { scrollTop: dropdownTarget.position().top },
        'slow'
      );
    }
  });

  // Initialize the filtering system
  window.filterTags = {
    bind: function () {
      var options = {
        valueNames: [{ data: ["tags"] }],
        page: "6",
        pagination: true
      };

      var tutorialList = new List("tutorial-cards", options);

      function filterSelectedTags(cardTags, selectedTags) {
        return cardTags.some(function (tag) {
          return selectedTags.some(function (selectedTag) {
            return selectedTag == tag;
          });
        });
      }

      function updateList() {
        var selectedTags = [];

        $(".selected").each(function () {
          selectedTags.push($(this).data("tag"));
        });

        tutorialList.filter(function (item) {
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

      $(".filter-btn").on("click", function () {
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

  // Initialize the filter system
  window.filterTags.bind();

  // Tutorial cards functionality
  $(".tutorials-card").on("click", function () {
    window.location = $(this).attr("link");
  });

}); 