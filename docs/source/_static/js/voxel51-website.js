/* If necessary; on page load */
//document.addEventListener('DOMContentLoaded', function() {}, false);

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

function open_modal(modal_id, modal_closer_id) {
  // Get the modal
  let the_modal = document.getElementById(modal_id);

  the_modal.style.display = "flex";
  document.body.style.overflowY = "hidden";

  let the_modal_closer = document.getElementById(modal_closer_id);

  // When the user clicks on <span> (x), close the modal
  the_modal_closer &&
    (the_modal_closer.onclick = function () {
      the_modal.style.display = "none";
    });

  // When the user clicks anywhere outside of the modal, close it
  document.body.onclick = function (event) {
    if (event.target == the_modal) {
      the_modal.style.display = "none";
      document.body.style.overflowY = "auto";
      document.body.onclick = undefined;
    }
  };
}
