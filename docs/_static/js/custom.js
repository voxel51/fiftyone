window.addEventListener("scroll", function () {
  var navHeight = document.querySelector(".nav__main").clientHeight;
  var y = window.scrollY || window.pageYOffset;
  document.querySelector(".wy-nav-side").style.marginTop =
    Math.max(0, navHeight - y) + "px";
});
