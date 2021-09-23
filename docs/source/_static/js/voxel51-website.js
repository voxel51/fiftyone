let navMobileState = false;

function navMobileButton() {
  let mboff = document.getElementById("nav__main__mobilebutton--off");
  let mbon = document.getElementById("nav__main__mobilebutton--on");
  let menu = document.getElementById("nav__main__items");

  if (!navMobileState) {
    mboff.style.display = "block";
    mbon.style.display = "none";
    menu.style.display = "block";
  } else {
    mboff.style.display = "";
    mbon.style.display = "";
    menu.style.display = "";
  }

  navMobileState = !navMobileState;
}
