const builder = require("electron-builder");

function packWin() {
  return builder.build({
    targets: builder.Platform.WINDOWS.createTarget(),
  });
}

function packMac() {
  return builder.build({
    targets: builder.Platform.MAC.createTarget(),
  });
}

function packLinux() {
  return builder.build({
    targets: builder.Platform.LINUX.createTarget(),
  });
}

packWin.displayName = "builder-win";
packMac.displayName = "builder-mac";
packLinux.displayName = "builder-linux";

exports.packWin = packWin;
exports.packMac = packMac;
exports.packLinux = packLinux;
