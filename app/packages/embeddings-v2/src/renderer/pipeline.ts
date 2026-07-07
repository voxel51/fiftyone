import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import { DEFAULT_SETTINGS } from "./constants";
import { SCREEN_FRAGMENT, SCREEN_VERTEX } from "./shaders";
import type { RenderSettings } from "./types";

/**
 * The density half of the renderer: an off-screen half-float target the
 * points accumulate into additively, plus a fullscreen tone-map pass.
 * render() runs either the two-pass density pipeline or a plain direct
 * pass (alpha/opaque modes need no accumulation).
 */
export class DensityPipeline {
  private readonly accumTarget: WebGLRenderTarget;
  private readonly screenScene = new Scene();
  private readonly screenMaterial: RawShaderMaterial;
  // The screen pass ignores cameras; any camera object satisfies render()
  private readonly screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    // Accumulated weights exceed 1, so the buffer must be float
    this.accumTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    // Fullscreen triangle (covers the viewport with 3 vertices, no seam)
    const quad = new BufferGeometry();
    quad.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2),
    );
    // Pre-set so nothing ever calls computeBoundingSphere(), which can't
    // handle itemSize-2 positions
    quad.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1);
    this.screenMaterial = new RawShaderMaterial({
      vertexShader: SCREEN_VERTEX,
      fragmentShader: SCREEN_FRAGMENT,
      uniforms: {
        uAcc: { value: this.accumTarget.texture },
        uGamma: { value: DEFAULT_SETTINGS.gamma },
        uGlow: { value: DEFAULT_SETTINGS.glow },
        uAlphaSingle: { value: DEFAULT_SETTINGS.singleAlpha },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const screenMesh = new Mesh(quad, this.screenMaterial);
    screenMesh.frustumCulled = false;
    this.screenScene.add(screenMesh);
  }

  /** Physical pixels — match the canvas drawing buffer exactly */
  setSize(width: number, height: number): void {
    this.accumTarget.setSize(width, height);
  }

  applySettings({ gamma, glow, singleAlpha }: RenderSettings): void {
    this.screenMaterial.uniforms.uGamma.value = gamma;
    this.screenMaterial.uniforms.uGlow.value = glow;
    this.screenMaterial.uniforms.uAlphaSingle.value = singleAlpha;
  }

  /** Pass 1: accumulate density off-screen; pass 2: tone-map to screen.
   *  Non-density modes: one pass, points straight onto the canvas. */
  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    density: boolean,
  ): void {
    if (density) {
      renderer.setRenderTarget(this.accumTarget);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(this.screenScene, this.screenCamera);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  dispose(): void {
    this.screenMaterial.dispose();
    this.accumTarget.dispose();
  }
}
