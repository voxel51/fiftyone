const { task, series } = require("gulp");
const rimraf = require("rimraf");

const scripts = require("./tasks/scripts");
const assets = require("./tasks/assets");
const watch = require("./tasks/watch");
const dist = require("./tasks/distribution");

task("clean", function (done) {
  rimraf("./build", done);
});
task("build", series("clean", assets.copyHtml, scripts.build));
task("develop", series("clean", watch.start));
task("pack-win", series("build", dist.packWin));
task("pack-linux", series("build", dist.packLinux));
task("pack-mac", series("build", dist.packMac));
