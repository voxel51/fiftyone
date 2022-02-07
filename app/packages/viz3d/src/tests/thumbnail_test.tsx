
import * as draco_loader from "../draco_loader"
import * as pcd from "../point_cloud_display"
import * as thumbs from "../thumbnail_generator"

const benchmark = function (){
  let decoder_count = navigator.hardwareConcurrency;
  let gen_count = 5;
  let file_count = 100;
  let thumb_size = 100;

  let scene = new pcd.SceneConfigBuilder()
    .setSaveDrawingBuffer(true)
    .setBackgroundColor(0xFF0000)
    .build();

  let loader = new draco_loader.DracoLoaderBuilder()
    .setLogLevel(draco_loader.LogLevel.NONE)
    .setWorkerCount(decoder_count)
    .build();
  let thumb_gen = new thumbs.ThumbnailGenerator(thumb_size, thumb_size, scene);
  let drc_urls = [];

  var true_start = undefined;
  var start_time = undefined;

  for (let i = 0; i < file_count; i++){
    let url = window.location.origin + "/data/object0.drc";
    drc_urls.push(url);
  }

  start_time = Date.now();
  console.log(`Starting fetch test at ${start_time}`);
  console.log(`Samples: ${file_count}`);
  let buf_data = drc_urls.map((v) => draco_loader._loadFile("", v, "arraybuffer"));
  Promise.all(buf_data).then((data) => {
    let duration = Date.now() - start_time;
    let bufs: ArrayBuffer[] = data as ArrayBuffer[];
    let bytes = bufs.reduce((sum, buf) => sum + buf.byteLength, 0);
    console.log(`Fetched ${file_count} files, ${bytes} bytes in ${duration}`);
  });



  let meshes = Promise.all(buf_data).then((bufs) => {
    // Don't factor in network time...
    true_start = start_time = Date.now();
    console.log(`Starting decode test at: ${start_time}`);
    console.log(`decoders: ${decoder_count}`); 
    return loader.then((draco) => draco.loadMeshes(bufs as ArrayBuffer[]));
  });
  meshes.then((values) => {
    let duration = Date.now() - start_time;
    console.log(`Decoded ${file_count} meshes in ${duration}`);
    console.log(`${duration / file_count}ms per mesh`);
  });

  let thumb_data = meshes.then((data) => {
    start_time = Date.now();
    console.log(`Starting thumbnail test at: ${start_time}`);
    console.log(`Generators: ${gen_count}`); 
    return thumb_gen.makeThumbnailURLs(data);
  });

  thumb_data.then((urls) => {
    let end_time = Date.now();
    let duration = end_time - start_time;
    console.log(urls);
    console.log(`Generated ${file_count} thumbs (${thumb_size} x ${thumb_size}) in ${end_time - start_time} ms`);
    console.log(`${duration / file_count}ms per mesh`);
    console.log(`Total Duration ${end_time - true_start}`);
  });
}

document.addEventListener("DOMContentLoaded", () =>{
  benchmark();
});