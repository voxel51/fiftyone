$(function () {
  const sections = $(".section").sort(
    (a, b) => $(a).offset().top - $(b).offset().top
  );

  const sectionStartThreshold =
    $("#pytorch-page-level-bar").height() +
    parseInt($(".section h2").css("marginTop")) +
    10;

  let lastSection = undefined;

  function updateSidebar(e) {
    let currentSection = undefined;
    let clicked = false;
    if (e.target && e.target.href && e.target.href.indexOf("#") >= 0) {
      currentSection = e.target.href.split("#").pop();
      clicked = true;
    } else {
      for (let i = sections.length - 1; i >= 0; i--) {
        if (
          $(sections[i]).offset().top <
          $(window).scrollTop() + sectionStartThreshold
        ) {
          currentSection = sections[i].id;
          break;
        }
      }
    }

    if (currentSection != lastSection) {
      lastSection = currentSection;
      let sectionItems = $(".pytorch-content-right .pytorch-side-scroll li");

      sectionItems.removeClass("current-section");
      sectionItems
        .find("a.expanded")
        .removeClass("expanded")
        .addClass("not-expanded");
      sectionItems.find("ul ul").hide();

      if (currentSection) {
        let currentLink = sectionItems.find(
          'a[href="#' + currentSection + '"]'
        );
        currentLink.parent("li").addClass("current-section");
        currentLink.parents("ul").show();
        currentLink
          .parents("ul")
          .siblings("a.not-expanded")
          .removeClass("not-expanded")
          .addClass("expanded");

        if (clicked && currentLink.siblings("ul").length) {
          currentLink.removeClass("not-expanded").addClass("expanded");
          currentLink.siblings("ul").show();
        }
      }
    }
  }

  $(window).on("scroll", updateSidebar);
  $(".pytorch-right-menu").on("click", updateSidebar);
});
