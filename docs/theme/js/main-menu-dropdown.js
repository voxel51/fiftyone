window.mainMenuDropdown = {
  bind: function() {
    $("[data-toggle='ecosystem-dropdown']").on("click", function() {
      toggleDropdown($(this).attr("data-toggle"));
    });

    $("[data-toggle='resources-dropdown']").on("click", function() {
      toggleDropdown($(this).attr("data-toggle"));
    });

    function toggleDropdown(menuToggle) {
      var showMenuClass = "show-menu";
      var menuClass = "." + menuToggle + "-menu";

      if ($(menuClass).hasClass(showMenuClass)) {
        $(menuClass).removeClass(showMenuClass);
      } else {
        $("[data-toggle=" + menuToggle + "].show-menu").removeClass(
          showMenuClass
        );
        $(menuClass).addClass(showMenuClass);
      }
    }
  }
};
