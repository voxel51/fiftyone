import * as three from "three"
import * as d3d from "./display3d"

// Apparently the JS canvas API CANNOT be 
// used to handle depth data reliably. 
// See: https://stackoverflow.com/questions/43412842/reconstruct-original-16-bit-raw-pixel-data-from-the-html5-canvas
import upng from "./upng"

export class RGBDProjectionOptions {
    public depth_bytes: number = 2;
    public depth_scale: number = 1000;
    public depth_trunc: number = 3;

    constructor () {}
};

class ImageData<T extends ArrayLike<number>> {
    public width: number;
    public height: number;
    public data: T;

    constructor (width: number, height: number, data: T) {
        this.width = width;
        this.height = height;
        this.data = data;
    }
};



// TODO: Consider moving this into a worker.
// Given that this is typically used for modal 
// depth display it may not be necessary.

// TODO: Only supports PNG at the moment.
export class RGBDProjector {

    constructor () {
    }

    private _fetchFile (path: string): Promise<ArrayBuffer> {
        return fetch(path)
            .then(res => res.blob())
            .then(blob => blob.arrayBuffer());
    }


    private _createMesh (color: ImageData<Uint8Array>, depth: ImageData<Uint16Array>, options: RGBDProjectionOptions): three.Mesh {
        //let fov = color.width / color.height;
        //let camera = new three.PerspectiveCamera(50, fov, 0.1, 2000);
        //camera.updateProjectionMatrix();

        let geometry = new three.BufferGeometry();
        let positions = [];
        let colors = [];
        let point = new three.Vector3();
        let aspect = color.width/color.height;

        for (let j = 0; j < color.height; j++){
            for (let i = 0; i < color.width; i++){
                let idx = j * color.width + i;

                // TODO Need a way to know how large depth values are.
                let z = depth.data[idx];
                z = z / options.depth_scale;
                if (z === 0 || z > options.depth_trunc) continue;

                let x = ((i / color.width) - 0.5) * aspect;
                let y = (j / color.height) - 0.5;

                colors.push(color.data[idx*4] / 255);
                colors.push(color.data[idx*4+1] / 255);
                colors.push(color.data[idx*4+2] / 255);

                point.set(x, y, z);
                positions.push(point.x);
                positions.push(point.y);
                positions.push(point.z);

            }
        }

        let positionsBuf = new Float32Array(positions);
        let colorsBuf = new Float32Array(colors);
        geometry.setAttribute("position", new three.Float32BufferAttribute(positionsBuf, 3));
        geometry.setAttribute("color", new three.Float32BufferAttribute(colorsBuf, 3));
        let material = new three.PointsMaterial({
            vertexColors: true,
            size: 0.005
        });
        let mesh = new three.Points(geometry, material);
        return mesh;
    }

    public createMesh (color: string, depth: string, options?: RGBDProjectionOptions): Promise<three.Mesh> {
        options = options ? options : new RGBDProjectionOptions();
        let color_img = this._fetchFile(color).then((buf) => {
            let uimg = upng.decode(buf);
            let img = upng.toRGBA8(uimg)[0];
            return new ImageData<Uint8Array>(uimg.width, uimg.height, new Uint8Array(img));
        });

        let depth_img = this._fetchFile(depth).then((buf) => {
            let uimg = upng.decode(buf);
            let vals = [];
            for (let i = 0; i < uimg.data.length; i+=2){
                let v = uimg.data[i+0] << 8 | uimg.data[i+1];
                vals.push(v);
            }
            return new ImageData(uimg.width, uimg.height, new Uint16Array(vals));

            // TODO: can't seem to specify endianess of typed arrays
            // You can use DataView to read different endianness values, which might be better...
            //return new ImageData(uimg.width, uimg.height, new Uint16Array(uimg.data.buffer));

        });
        return Promise.all([color_img, depth_img]).then((images) => {
            return this._createMesh(images[0], images[1], options);
        });
    }


};