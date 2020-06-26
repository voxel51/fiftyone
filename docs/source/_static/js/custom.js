$(function () {
  const sections = $(".section").sort(
    (a, b) => $(a).offset().top - $(b).offset().top
  );

  function updateSidebar() {
    let currentSection = undefined;
    for (let i = sections.length - 1; i >= 0; i--) {
      if (
        $(sections[i]).offset().top <
        $(window).scrollTop() + $(window).height() / 2
      ) {
        currentSection = sections[i].id;
        break;
      }
    }

    if (currentSection) {
      $(".pytorch-content-right .pytorch-side-scroll li")
        .removeClass("current-section")
        .filter(":not(:has(a.title-link))")
        .filter(':has(a[href="#' + currentSection + '"])')
        .filter(":visible")
        .filter(":last")
        .addClass("current-section");
    }
  }

  $(window).on("scroll", updateSidebar);
  $(".pytorch-right-menu").on("click", updateSidebar);
});
