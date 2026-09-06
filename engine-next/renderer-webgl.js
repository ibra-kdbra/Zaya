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
      // Kept so a test (and a screenshot tool) can read the drawing buffer back.
      preserveDrawingBuffer: true,
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

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.stage.addEventListener("pointerdown", this.onPointerDown);
    this.drag = null;
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

    this.camera.position.set(0, offset, dist);
    this.camera.lookAt(0, offset, 0);
    this.camera.updateProjectionMatrix();
    this.requestRender();
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
    return this.runTurn(spec, from, to);
  }

  runTurn(spec, from, to) {
    const duration = Math.max(0, spec.duration || 0);
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
          resolve({ frames, ms: performance.now() - started });
        }
      };
      requestAnimationFrame(step);
    });
  }

  /* ---- drag ------------------------------------------------------------------------------ */

  onPointerDown(event) {
    if (this.disposed || this.book.busy || event.button !== 0) return;
    const rect = this.stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const forwardSide = this.book.direction === "rtl" ? x < 0.5 : x > 0.5;
    this.drag = {
      id: event.pointerId, startX: event.clientX, forward: forwardSide,
      moved: false, width: Math.max(1, rect.width),
    };
    this.stage.setPointerCapture(event.pointerId);
    this.stage.classList.add("zn-grabbing");
    this.stage.addEventListener("pointermove", this.onPointerMove);
    this.stage.addEventListener("pointerup", this.onPointerUp);
    this.stage.addEventListener("pointercancel", this.onPointerUp);
  }

  onPointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const dx = event.clientX - this.drag.startX;
    if (!this.drag.moved && Math.abs(dx) < 6) return;
    this.drag.moved = true;
    this.drag.progress = Math.min(1, Math.abs(dx) / (this.drag.width * 0.45));
    // Live preview would need the neighbouring textures ready; the sheet is built on release.
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const drag = this.drag;
    this.drag = null;
    this.stage.classList.remove("zn-grabbing");
    this.stage.removeEventListener("pointermove", this.onPointerMove);
    this.stage.removeEventListener("pointerup", this.onPointerUp);
    this.stage.removeEventListener("pointercancel", this.onPointerUp);
    try { this.stage.releasePointerCapture(drag.id); } catch (err) { /* already gone */ }
    const dx = event.clientX - drag.startX;
    const far = Math.abs(dx) > drag.width * 0.08;
    // A drag turns the way it was dragged; a plain click turns the side it landed on.
    if (drag.moved && far) {
      const backwards = this.book.direction === "rtl" ? dx > 0 : dx < 0;
      if (backwards) this.book.next(); else this.book.prev();
    } else if (!drag.moved) {
      if (drag.forward) this.book.next(); else this.book.prev();
    }
  }

  dispose() {
    this.disposed = true;
    this.stage.removeEventListener("pointerdown", this.onPointerDown);
    this.stage.removeEventListener("pointermove", this.onPointerMove);
    this.stage.removeEventListener("pointerup", this.onPointerUp);
    this.stage.removeEventListener("pointercancel", this.onPointerUp);
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
