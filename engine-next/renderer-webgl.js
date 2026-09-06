/**
 * The WebGL renderer: a book drawn with three.js.
 *
 * The scene is deliberately small. Two flat meshes hold the spread on screen. A turn adds a
 * third and fourth — the two faces of the sheet in flight — whose vertices are moved on the CPU
 * each frame so the sheet swings about the spine and bulges the way paper does. A small
 * `onBeforeCompile` chunk darkens the inside of that bulge, which is what actually sells it.
 *
 * Nothing is drawn unless something changed: the renderer paints on demand, and during a turn
 * on every frame, then stops.
 *
 * Zoom is the camera, not the geometry: the lens comes closer and slides sideways, so the
 * magnified page is drawn from the same textures at whatever sharpness they carry, and the
 * engine re-renders them larger behind it. Because the camera is the only thing that moves,
 * projecting the corners of a page mesh gives the text layer exactly the box it needs.
 */

import * as THREE from "../vendor/three/three.module.min.js";

const FOV = 32;
/** Segments across the sheet. Enough that the curl reads as a curve rather than a fold. */
const SEGMENTS = 28;
/** How far the paper bulges out of plane, as a fraction of the page width. */
const CURL = 0.16;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function isSupported() {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch (err) {
    return false;
  }
}

/** A material that shows a page and shades the curl. */
function pageMaterial(back) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: back ? THREE.BackSide : THREE.FrontSide,
    transparent: false,
  });
  material.userData.shade = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShade = material.userData.shade;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uShade;\nvoid main() {")
      .replace("#include <map_fragment>",
        "#include <map_fragment>\n#ifdef USE_MAP\n" +
        "  float curlShade = uShade * (1.0 - smoothstep(0.0, 0.85, vMapUv.x));\n" +
        "  diffuseColor.rgb *= 1.0 - curlShade;\n#endif");
  };
  return material;
}

export class WebglRenderer {
  /**
   * @param {object} book the ZayaBook; the renderer reads its layout, options and textures
   * @param {HTMLElement} stage element to draw into (the engine owns it)
   */
  constructor(book, stage) {
    this.book = book;
    this.stage = stage;
    this.mode = "webgl";
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      // Reading the drawing buffer back costs a copy on some drivers, so it is only kept for a
      // caller that has said it will read it: a test, or a screenshot tool.
      preserveDrawingBuffer: !!book.options.readback,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = "zn-canvas";
    this.stage.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
    this.setBackground(book.options.backgroundColor);

    this.pageW = 0.72;                 // world units; corrected as soon as a page is measured
    this.pageH = 1;
    this.left = this.makePage();
    this.right = this.makePage();
    this.sheetFront = null;
    this.sheetBack = null;
    this.turn = null;                  // { progress, side, hard } while a sheet is in flight
    this.frame = 0;
    this.pending = false;
    this.zoom = { level: 1, x: 0, y: 0 };
    this.fit = { distance: 2, offset: 0, worldPerPixel: 1 };
  }

  makePage() {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const mesh = new THREE.Mesh(geometry, pageMaterial(false));
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  setBackground(color) {
    this.scene.background = new THREE.Color(color || "#20232a");
  }

  /* ---- geometry -------------------------------------------------------------------------- */

  /** Set the world size of a page from its aspect ratio (width ÷ height). */
  setPageAspect(aspect) {
    this.pageH = 1;
    this.pageW = Math.max(0.2, Math.min(4, aspect || 0.72));
  }

  /** Put a texture on a static page mesh and place it on its side of the spine. */
  place(mesh, canvas, side) {
    if (!canvas) { mesh.visible = false; return; }
    const previous = mesh.material.map;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    if (previous) previous.dispose();
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(this.pageW, this.pageH, 1, 1);
    mesh.position.set(side === 0 ? 0 : side * this.pageW / 2, 0, 0);
    mesh.visible = true;
  }

  /**
   * Show a spread with no animation.
   * @param {HTMLCanvasElement|null} leftCanvas
   * @param {HTMLCanvasElement|null} rightCanvas
   * @param {boolean} single one page, centred
   */
  showSpread(leftCanvas, rightCanvas, single) {
    if (single) {
      this.place(this.left, leftCanvas || rightCanvas, 0);
      this.right.visible = false;
    } else {
      this.place(this.left, leftCanvas, -1);
      this.place(this.right, rightCanvas, 1);
    }
    this.requestRender();
  }

  /** Build the two faces of the sheet in flight. */
  makeSheet(frontCanvas, backCanvas) {
    this.destroySheet();
    const build = (canvas, back) => {
      const geometry = new THREE.PlaneGeometry(this.pageW, this.pageH, SEGMENTS, 1);
      geometry.translate(this.pageW / 2, 0, 0);       // hinge on the spine, at x = 0
      const uv = geometry.attributes.uv;
      if (back) {
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // seen from behind
        uv.needsUpdate = true;
      }
      const material = pageMaterial(back);
      if (canvas) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        material.map = texture;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.base = Float32Array.from(geometry.attributes.position.array);
      this.scene.add(mesh);
      return mesh;
    };
    this.sheetFront = build(frontCanvas, false);
    this.sheetBack = build(backCanvas, true);
  }

  destroySheet() {
    [this.sheetFront, this.sheetBack].forEach((mesh) => {
      if (!mesh) return;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    });
    this.sheetFront = this.sheetBack = null;
  }

  /**
   * Move the sheet's vertices for a turn `progress` of 0 (flat on its own side) to 1 (flat on
   * the other). `side` is +1 when the sheet starts on the right, -1 when it starts on the left.
   *
   * A vertex is placed by its distance from the spine and a bulge out of the sheet's plane; the
   * bulge peaks halfway through the turn and halfway along the sheet, and vanishes at both ends,
   * which is what stops the paper looking like a rotating board.
   */
  deform(progress, side, hard) {
    const angle = Math.PI * progress;
    const bulge = hard ? 0 : Math.sin(Math.PI * progress) * CURL * this.pageW;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    [this.sheetFront, this.sheetBack].forEach((mesh) => {
      if (!mesh) return;
      const base = mesh.userData.base;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const r = base[i * 3];                       // distance from the spine, 0 … pageW
        const u = this.pageW ? r / this.pageW : 0;
        const dz = bulge * Math.sin(Math.PI * u);
        position.setX(i, side * (r * cos + dz * sin));
        position.setY(i, base[i * 3 + 1]);
        position.setZ(i, r * sin + dz * cos);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.material.userData.shade.value = hard ? 0 : Math.sin(Math.PI * progress) * 0.35;
      mesh.visible = true;
    });
  }

  /* ---- camera ---------------------------------------------------------------------------- */

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    const options = this.book.options;
    const padTop = Math.max(0, options.paddingTop || 0);
    const padBottom = Math.max(0, options.paddingBottom || 0);
    const usable = Math.max(1, height - padTop - padBottom);

    const single = this.book.pageMode === "single";
    const spreadW = (single ? 1 : 2) * this.pageW;
    const spreadH = this.pageH;
    const margin = 1.06;                             // a little air around the book
    const halfFov = (FOV * Math.PI) / 180 / 2;
    const distByHeight = ((spreadH / 2) * margin) / Math.tan(halfFov) * (height / usable);
    const distByWidth = ((spreadW / 2) * margin) / (Math.tan(halfFov) * this.camera.aspect);
    const dist = Math.max(distByHeight, distByWidth, 0.5);

    // Shift the camera so the book sits centred in what is left after the padding.
    const worldPerPixel = (2 * dist * Math.tan(halfFov)) / height;
    const offset = (padTop + usable / 2 - height / 2) * worldPerPixel;

    this.fit = { distance: dist, offset, worldPerPixel };
    this.placeCamera();
  }

  /* ---- zoom ------------------------------------------------------------------------------- */

  /**
   * Magnify by bringing the camera in, and pan by sliding it across the page plane.
   * @param {number} level 1 is fit-to-stage
   * @param {number} x pan, CSS pixels; positive moves the page right
   * @param {number} y pan, CSS pixels; positive moves the page down
   */
  setZoom(level, x, y) {
    this.zoom = { level: Math.max(0.05, level || 1), x: x || 0, y: y || 0 };
    this.placeCamera();
  }

  placeCamera() {
    if (this.disposed) return;
    const { distance, offset, worldPerPixel } = this.fit;
    const level = this.zoom.level || 1;
    // The world seen per pixel shrinks with the zoom, so a pan in pixels is a pan in the
    // magnified picture rather than in the fitted one.
    const perPixel = worldPerPixel / level;
    const cx = -this.zoom.x * perPixel;
    const cy = offset + this.zoom.y * perPixel;
    this.camera.position.set(cx, cy, distance / level);
    this.camera.lookAt(cx, cy, 0);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** The point a zoom happens about: the middle of the stage, which is where the lens looks. */
  zoomOrigin() {
    return { x: Math.max(1, this.stage.clientWidth) / 2, y: Math.max(1, this.stage.clientHeight) / 2 };
  }

  /** How big the spread is on screen before any magnification, in CSS pixels. */
  fitSize() {
    const perPixel = this.fit.worldPerPixel || 1;
    const across = this.book.pageMode === "single" ? 1 : 2;
    return { width: (across * this.pageW) / perPixel, height: this.pageH / perPixel };
  }

  /**
   * Where each half of the spread lands on the stage, in CSS pixels, by projecting the corners
   * of the page plane through the camera as it stands.
   * @returns {Array<{side: 'left'|'right', x: number, y: number, width: number, height: number}>}
   */
  pageBoxes() {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const single = this.book.pageMode === "single";
    const halfH = this.pageH / 2;
    const spans = single
      ? [["left", -this.pageW / 2, this.pageW / 2]]
      : [["left", -this.pageW, 0], ["right", 0, this.pageW]];
    const out = [];
    spans.forEach(([side, x0, x1]) => {
      const mesh = side === "left" ? this.left : this.right;
      if (!mesh || !mesh.visible) return;
      const topLeft = this.project(x0, halfH, width, height);
      const bottomRight = this.project(x1, -halfH, width, height);
      out.push({
        side,
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      });
    });
    return out;
  }

  /** A point on the page plane, in stage pixels. */
  project(x, y, width, height) {
    const point = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
  }

  /* ---- painting -------------------------------------------------------------------------- */

  requestRender() {
    if (this.disposed || this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.paint();
    });
  }

  paint() {
    if (this.disposed) return;
    this.frame++;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Animate one sheet from `progress` 0 to 1 (or the other way).
   * @param {{front: HTMLCanvasElement|null, back: HTMLCanvasElement|null,
   *          side: 1|-1, hard: boolean, backwards: boolean, duration: number}} spec
   * @returns {Promise<{frames: number, ms: number}>}
   */
  animateTurn(spec) {
    this.makeSheet(spec.front, spec.back);
    const from = spec.backwards ? 1 : 0;
    const to = spec.backwards ? 0 : 1;
    this.spec = spec;
    return this.runTurn(spec, from, to, spec.duration);
  }

  /** Build the sheet and hold it at `progress`, for a drag that will move it by hand. */
  beginTurn(spec, progress) {
    this.makeSheet(spec.front, spec.back);
    this.spec = spec;
    this.updateTurn(progress || 0);
  }

  /** Move the sheet a drag is holding. */
  updateTurn(progress) {
    if (!this.spec) return;
    const p = Math.max(0, Math.min(1, progress));
    this.deform(p, this.spec.side, this.spec.hard);
    this.paint();
  }

  /**
   * Let a dragged sheet settle to `to`, starting from where it is.
   * @returns {Promise<{frames: number, ms: number}>}
   */
  settleTurn(from, to, duration) {
    if (!this.spec) return Promise.resolve({ frames: 0, ms: 0 });
    return this.runTurn(this.spec, from, to, duration);
  }

  runTurn(spec, from, to, ms) {
    const duration = Math.max(0, ms || 0);
    const started = performance.now();
    let frames = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (this.disposed) return resolve({ frames, ms: 0 });
        const elapsed = performance.now() - started;
        const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
        this.deform(from + (to - from) * easeInOutCubic(t), spec.side, spec.hard);
        this.paint();
        frames++;
        if (t < 1) requestAnimationFrame(step);
        else {
          this.destroySheet();
          this.spec = null;
          resolve({ frames, ms: performance.now() - started });
        }
      };
      requestAnimationFrame(step);
    });
  }

  dispose() {
    this.disposed = true;
    this.destroySheet();
    [this.left, this.right].forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    });
    this.renderer.dispose();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
