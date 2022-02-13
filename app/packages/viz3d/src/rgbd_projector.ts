import * as three from "three"
import * as d3d from "./display3d"


// TODO: Consider moving this into a worker.
export class RGBDProjector {
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;

    constructor () {
        this._canvas = document.createElement("canvas");
        this._ctx = this._canvas.getContext("2d");
    }

    private _loadImage (path: string): Promise<HTMLImageElement> {
        let resolver = null;
        let res = new Promise<HTMLImageElement>((resolve,reject) => {
            resolver = {resolve, reject};
        });

        let image = new Image();
        image.src = path;

        image.onload = () => {
            resolver.resolve(image);
        };
        return res;
    }

    private _loadImages (paths: string[]): Promise<HTMLImageElement[]> {
        return Promise.all(paths.map((v) => this._loadImage(v)));
    }


    private _getImageData (image: HTMLImageElement): ImageData {
        this._canvas.width = image.width;
        this._canvas.height = image.height;
        this._ctx.drawImage(image, 0, 0);
        let colorData = this._ctx.getImageData(0,0,this._canvas.width, this._canvas.height);
        return colorData;
    }

    private _createMesh (color: ImageData, depth: ImageData): three.Mesh {
        //let fov = color.width / color.height;
        //let camera = new three.PerspectiveCamera(50, fov, 0.1, 2000);
        //camera.updateProjectionMatrix();

        let point_count = color.width * color.height;
        let geometry = new three.BufferGeometry();
        let positions = [];
        let colors = [];
        let point = new three.Vector3();

        for (let j = 0; j < color.height; j++){
            for (let i = 0; i < color.width; i++){
                let idx = i + (j * color.width);
                let x = i / color.width;
                let y = j / color.height;

                // TODO Need a way to know how large depth values are.
                let z = (depth.data[idx*4 + 0] | (depth.data[idx*4 + 1] << 8));// | (depth.data[idx*4 + 2] << 16) | (depth.data[idx*4+3] << 24)); 
                z = z / 0xffff;
                if (z === 0) continue;

                colors.push(color.data[idx*4] / 255);
                colors.push(color.data[idx*4+1] / 255);
                colors.push(color.data[idx*4+2] / 255);

                positions.push(x-0.5);
                positions.push(y-0.5);
                positions.push(z);

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

    public createMesh (color: string, depth: string): Promise<three.Mesh> {
        return this._loadImages([color, depth]).then((images) => {
            let colorData = this._getImageData(images[0]);
            let depthData = this._getImageData(images[1]);
            return this._createMesh(colorData, depthData);
        });
    }


};