import { shortcutBus } from './ShortcutBus';
import { commandForKeyboardEvent } from './commands';

/** Normalized pointer data handed to the editor, independent of DOM quirks. */
export interface PointerSample {
  readonly pointerId: number;
  readonly pointerType: 'pen' | 'touch' | 'mouse';
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}

/** Operations the input router can ask the editor runtime to perform. */
export interface InputRouterHost {
  orbit(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  /**
   * Try to start a tool edit. Returns true only when the pointer captured a
   * topology element; mouse clicks on empty viewport space then fall through to
   * the orbit fallback.
   */
  activateEditor(editor: '3d' | 'uv'): void;
  isUvActive(): boolean;
  isAnnotationMode(): boolean;
  beginToolPointer(sample: PointerSample): boolean;
  hoverToolPointer(sample: PointerSample | null): void;
  moveToolPointer(sample: PointerSample): void;
  endToolPointer(sample: PointerSample): void;
  cancelToolPointer(): void;
  undo(): void;
  redo(): void;
  frameSelection(): void;
  deleteSelection(): void;
  toggleAxisLock(axis: 'x' | 'y' | 'z'): void;
  tapSelect(clientX: number, clientY: number, additive?: boolean): void;
  finishOrbitClick(moved: boolean, additive: boolean): void;
  setPointerReading(sample: PointerSample | null): void;
  isModalTransformActive(): boolean;
  beginModalTransform(
    kind: 'translate' | 'rotate' | 'scale',
    clientX: number,
    clientY: number
  ): boolean;
  modalPointerMove(sample: PointerSample): void;
  modalTransformKey(key: string): void;
  commitModalTransform(): void;
  armAction(kind: 'extrude' | 'inset' | 'loop-cut' | 'loop-slide'): void;
  hasActiveAction(): boolean;
  isActionAdjusting(): boolean;
  actionKey(key: string): boolean;
  isLassoMode(): boolean;
  beginLasso(clientX: number, clientY: number): boolean;
  moveLasso(clientX: number, clientY: number): void;
  endLasso(clientX: number, clientY: number): void;
  cancelLasso(): void;
  resetView(): void;
  selectAll(): void;
}

/** The current phase of a multi-touch recognizer. */
type TouchMode =
  | 'none'
  | 'pending'
  | 'single'
  | 'pair'
  | 'lasso'
  | 'tool'
  | 'blocked';

/** Start and latest positions for one active touch pointer. */
interface TouchRecord {
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
}

/** Mouse gesture state while a button is held. */
interface MouseGesture {
  mode: 'none' | 'orbit' | 'pan' | 'tool' | 'lasso';
  pointerId: number | null;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/** Centroid and spread of the active touch pointers. */
interface TouchCentroid {
  x: number;
  y: number;
  spread: number;
}

const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_TRAVEL_CSS = 10;
const CAMERA_START_TRAVEL_CSS = 3;
const PEN_TOUCH_COOLDOWN_MS = 300;
const TOUCH_MOUSE_GUARD_MS = 350;

/**
 * Single ingress for pointer, wheel, and keyboard interaction.
 *
 * Pen bypasses camera gestures entirely. A one-finger touch tap selects while
 * a drag orbits; two-finger gestures pan/zoom and tap undo, and three-finger
 * taps redo. Mouse maps to the documented DCC-style controls.
 * Browser gesture defaults are suppressed only on the viewport surface.
 */
export class InputRouter {
  private readonly element: HTMLElement;
  private readonly unregisterShortcuts: () => void;
  private readonly host: InputRouterHost;

  private readonly touches = new Map<number, TouchRecord>();
  private readonly ignoredTouches = new Set<number>();

  private touchMode: TouchMode = 'none';
  private touchStartedAt = 0;
  private touchMaxPointers = 0;
  private touchMaxTravel = 0;
  private touchCameraMoved = false;
  private touchInvalidated = false;
  private lastCentroidX = 0;
  private lastCentroidY = 0;
  private lastPinchDistance = 0;

  private activePenPointers = 0;
  private activePenPointerId: number | null = null;
  private activePenLasso = false;
  private touchLasso = false;
  private lastPenUpAt = -Infinity;
  private lastTouchUpAt = -Infinity;

  private readonly mouse: MouseGesture = {
    mode: 'none',
    pointerId: null,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    moved: false
  };
  private lastMouseX = 0;
  private lastMouseY = 0;
  private hasMousePosition = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    const sample = this.toSample(event);
    if (!sample) {
      return;
    }
    this.host.activateEditor('3d');

    if (sample.pointerType === 'mouse') {
      this.lastMouseX = sample.clientX;
      this.lastMouseY = sample.clientY;
      this.hasMousePosition = true;
    }

    if (this.host.isModalTransformActive()) {
      if (sample.pointerType !== 'mouse') {
        return;
      }
      if (event.button === 0) {
        this.host.commitModalTransform();
      } else if (event.button === 2) {
        this.host.modalTransformKey('Escape');
      }
      return;
    }

    if (this.host.isActionAdjusting()) {
      if (sample.pointerType === 'mouse' && event.button === 0) {
        this.host.actionKey('Enter');
      } else if (sample.pointerType === 'mouse' && event.button === 2) {
        this.host.actionKey('Escape');
      }
      return;
    }

    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; the surface still receives the events.
    }

    if (sample.pointerType === 'pen') {
      this.activePenPointers += 1;
      this.activePenPointerId = sample.pointerId;
      this.invalidateActiveTouchGesture();
      this.host.setPointerReading(sample);
      this.activePenLasso = this.host.isLassoMode();
      if (this.activePenLasso) {
        if (!this.host.beginLasso(sample.clientX, sample.clientY)) {
          this.activePenLasso = false;
          this.host.beginToolPointer(sample);
        }
      } else {
        this.host.beginToolPointer(sample);
      }
      return;
    }

    if (sample.pointerType === 'touch') {
      if (
        this.ignoredTouches.has(sample.pointerId) ||
        this.activePenPointers > 0 ||
        performance.now() - this.lastPenUpAt < PEN_TOUCH_COOLDOWN_MS
      ) {
        this.ignoredTouches.add(sample.pointerId);
        return;
      }
      this.handleTouchDown(sample);
      return;
    }

    if (performance.now() - this.lastTouchUpAt < TOUCH_MOUSE_GUARD_MS) {
      return;
    }

    if (event.button === 0 && sample.altKey) {
      // Option/Alt + LMB is the trackpad-friendly orbit gesture. Holding Shift
      // as well pans, mirroring Shift+MMB.
      this.mouse.mode = sample.shiftKey ? 'pan' : 'orbit';
      this.mouse.pointerId = sample.pointerId;
      this.mouse.lastX = sample.clientX;
      this.mouse.lastY = sample.clientY;
      return;
    }

    if (event.button === 0) {
      this.mouse.pointerId = sample.pointerId;
      this.mouse.lastX = sample.clientX;
      this.mouse.lastY = sample.clientY;
      this.mouse.startX = sample.clientX;
      this.mouse.startY = sample.clientY;
      this.mouse.moved = false;
      if (this.host.isLassoMode()) {
        if (this.host.beginLasso(sample.clientX, sample.clientY)) {
          this.mouse.mode = 'lasso';
          return;
        }
      }
      const captured = this.host.beginToolPointer(sample);
      // A left-drag that did not land on editable topology rotates the camera.
      // This keeps camera navigation usable on a MacBook trackpad or any
      // one-button mouse, while direct vertex manipulation stays primary.
      this.mouse.mode = captured ? 'tool' : 'orbit';
    } else if (event.button === 1) {
      this.mouse.mode = sample.shiftKey ? 'pan' : 'orbit';
      this.mouse.pointerId = sample.pointerId;
      this.mouse.lastX = sample.clientX;
      this.mouse.lastY = sample.clientY;
    } else if (event.button === 2) {
      // Right-drag is the dedicated pan gesture. Shift is therefore free for
      // additive selection and for orbiting while adding elements.
      this.mouse.mode = 'pan';
      this.mouse.pointerId = sample.pointerId;
      this.mouse.lastX = sample.clientX;
      this.mouse.lastY = sample.clientY;
    }
  };

  private readonly onPointerLeave = (): void => {
    this.host.hoverToolPointer(null);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const sample = this.toSample(event);
    if (!sample) {
      return;
    }

    if (sample.pointerType === 'mouse') {
      this.lastMouseX = sample.clientX;
      this.lastMouseY = sample.clientY;
      this.hasMousePosition = true;
    }

    if (this.host.isModalTransformActive()) {
      if (sample.pointerType === 'mouse') {
        this.host.modalPointerMove(sample);
      }
      return;
    }

    if (sample.pointerType === 'pen') {
      if (this.activePenPointerId !== sample.pointerId) {
        return;
      }
      this.host.setPointerReading(sample);
      if (this.activePenLasso) {
        this.host.moveLasso(sample.clientX, sample.clientY);
      } else {
        this.host.moveToolPointer(sample);
      }
      return;
    }

    if (sample.pointerType === 'touch') {
      if (this.ignoredTouches.has(sample.pointerId) || this.activePenPointers > 0) {
        return;
      }
      this.handleTouchMove(sample);
      return;
    }

    if (
      this.mouse.mode === 'lasso' &&
      this.mouse.pointerId === sample.pointerId
    ) {
      this.host.moveLasso(sample.clientX, sample.clientY);
      return;
    }

    if (this.mouse.mode === 'tool' && this.mouse.pointerId === sample.pointerId) {
      this.host.moveToolPointer(sample);
      return;
    }

    if (
      (this.mouse.mode === 'orbit' || this.mouse.mode === 'pan') &&
      this.mouse.pointerId === sample.pointerId
    ) {
      const dx = sample.clientX - this.mouse.lastX;
      const dy = sample.clientY - this.mouse.lastY;
      if (!this.mouse.moved) {
        this.mouse.moved =
          Math.hypot(
            sample.clientX - this.mouse.startX,
            sample.clientY - this.mouse.startY
          ) > 4;
      }
      this.mouse.lastX = sample.clientX;
      this.mouse.lastY = sample.clientY;
      if (this.mouse.mode === 'orbit') {
        this.host.orbit(dx, dy);
      } else {
        this.host.pan(dx, dy);
      }
    } else if (this.mouse.mode === 'none') {
      this.host.hoverToolPointer(sample);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const sample = this.toSample(event);
    if (!sample) {
      return;
    }

    if (this.host.isModalTransformActive()) {
      if (sample.pointerType === 'mouse') {
        this.lastMouseX = sample.clientX;
        this.lastMouseY = sample.clientY;
        this.hasMousePosition = true;
      }
      return;
    }

    this.releasePointerCapture(event.pointerId);

    if (sample.pointerType === 'pen') {
      if (this.activePenPointerId === sample.pointerId) {
        if (this.activePenLasso) {
          this.host.endLasso(sample.clientX, sample.clientY);
        } else {
          this.host.endToolPointer(sample);
        }
        this.activePenLasso = false;
        this.host.setPointerReading(null);
        this.activePenPointerId = null;
        this.activePenPointers = Math.max(0, this.activePenPointers - 1);
        this.lastPenUpAt = performance.now();
      }
      return;
    }

    if (sample.pointerType === 'touch') {
      if (this.ignoredTouches.has(sample.pointerId)) {
        this.ignoredTouches.delete(sample.pointerId);
        this.lastTouchUpAt = performance.now();
        return;
      }
      this.handleTouchUp(event);
      return;
    }

    if (this.mouse.mode === 'lasso' && this.mouse.pointerId === sample.pointerId) {
      this.host.endLasso(sample.clientX, sample.clientY);
    } else if (
      this.mouse.mode === 'tool' &&
      this.mouse.pointerId === sample.pointerId
    ) {
      this.host.endToolPointer(sample);
    } else if (
      this.mouse.mode === 'orbit' &&
      this.mouse.pointerId === sample.pointerId
    ) {
      this.host.finishOrbitClick(
        this.mouse.moved,
        sample.shiftKey || sample.metaKey || sample.ctrlKey
      );
    }
    this.resetMouseGesture(sample.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.host.isModalTransformActive()) {
      return;
    }
    this.releasePointerCapture(event.pointerId);

    if (event.pointerType === 'pen') {
      if (this.activePenLasso) {
        this.host.cancelLasso();
      } else {
        this.host.cancelToolPointer();
      }
      this.activePenLasso = false;
      this.host.setPointerReading(null);
      this.activePenPointerId = null;
      this.activePenPointers = Math.max(0, this.activePenPointers - 1);
      this.lastPenUpAt = performance.now();
      return;
    }

    if (event.pointerType === 'touch') {
      if (this.touchMode === 'tool') {
        this.host.cancelToolPointer();
      }
      this.ignoredTouches.delete(event.pointerId);
      this.touches.delete(event.pointerId);
      this.clearTouchGesture();
      return;
    }

    if (this.mouse.mode === 'lasso') {
      this.host.cancelLasso();
    } else {
      this.host.cancelToolPointer();
    }
    this.resetMouseGesture(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.host.activateEditor('3d');
    event.preventDefault();
    if (this.host.isModalTransformActive()) {
      return;
    }
    this.host.zoom(Math.exp(event.deltaY * 0.0012));
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (this.host.isModalTransformActive()) {
      event.preventDefault();
      this.host.modalTransformKey(event.key);
      return;
    }

    if (this.host.hasActiveAction()) {
      if (this.host.actionKey(event.key)) {
        event.preventDefault();
        return;
      }
    }

    const matched = commandForKeyboardEvent(event);
    if (!matched) {
      return;
    }

    if (
      this.host.isUvActive() &&
      (matched === 'tool.move' ||
        matched === 'tool.rotate' ||
        matched === 'tool.scale' ||
        matched === 'transform.axisX' ||
        matched === 'transform.axisY' ||
        matched === 'transform.axisZ' ||
        matched === 'mesh.extrude' ||
        matched === 'mesh.inset' ||
        matched === 'mesh.loopCut' ||
        matched === 'mesh.loopSlide' ||
        matched === 'edit.delete' ||
        matched === 'view.frame')
    ) {
      return;
    }

    switch (matched) {
      case 'edit.undo':
        event.preventDefault();
        this.host.undo();
        return;
      case 'edit.redo':
        event.preventDefault();
        this.host.redo();
        return;
      case 'selection.all':
        event.preventDefault();
        this.host.selectAll();
        return;
      case 'edit.delete':
        event.preventDefault();
        this.host.deleteSelection();
        return;
      case 'mesh.extrude':
      case 'mesh.inset':
      case 'mesh.loopCut':
      case 'mesh.loopSlide': {
        event.preventDefault();
        const kind =
          matched === 'mesh.extrude'
            ? 'extrude'
            : matched === 'mesh.inset'
              ? 'inset'
              : matched === 'mesh.loopCut'
                ? 'loop-cut'
                : 'loop-slide';
        this.host.armAction(kind);
        return;
      }
      case 'tool.move':
      case 'tool.rotate':
      case 'tool.scale': {
        const position = this.mousePosition();
        const kind =
          matched === 'tool.move'
            ? 'translate'
            : matched === 'tool.rotate'
              ? 'rotate'
              : 'scale';
        if (this.host.beginModalTransform(kind, position.x, position.y)) {
          event.preventDefault();
        }
        return;
      }
      case 'transform.axisX':
      case 'transform.axisY':
      case 'transform.axisZ':
        event.preventDefault();
        this.host.toggleAxisLock(matched.slice(-1).toLowerCase() as 'x' | 'y' | 'z');
        return;
      case 'view.frame':
        event.preventDefault();
        this.host.frameSelection();
        return;
      case 'view.home':
        event.preventDefault();
        this.host.resetView();
        return;
      default:
        // File, UV-only, and shell commands are owned by other handlers.
        return;
    }
  };

  private readonly onWindowBlur = (): void => {
    if (this.host.isModalTransformActive()) {
      this.host.modalTransformKey('Escape');
    }
    this.host.cancelToolPointer();
    this.touches.clear();
    this.ignoredTouches.clear();
    this.touchMode = 'none';
    this.mouse.mode = 'none';
    this.mouse.pointerId = null;
    this.mouse.moved = false;
    this.host.setPointerReading(null);
  };

  private mousePosition(): { x: number; y: number } {
    if (this.hasMousePosition) {
      return { x: this.lastMouseX, y: this.lastMouseY };
    }
    const rect = this.element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  constructor(element: HTMLElement, host: InputRouterHost) {
    this.element = element;
    this.host = host;

    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerCancel);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    this.unregisterShortcuts = shortcutBus.register(this.onKeyDown);
    window.addEventListener('blur', this.onWindowBlur);
  }

  /** Remove every listener owned by the router. */
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointerleave', this.onPointerLeave);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.unregisterShortcuts();
    window.removeEventListener('blur', this.onWindowBlur);
    this.touches.clear();
    this.ignoredTouches.clear();
  }

  private handleTouchDown(sample: PointerSample): void {
    if (this.touches.size === 0) {
      this.touchStartedAt = performance.now();
      this.touchMaxPointers = 0;
      this.touchMaxTravel = 0;
      this.touchCameraMoved = false;
      this.touchInvalidated = false;
      this.touchMode = 'pending';
    }

    this.touches.set(sample.pointerId, {
      startX: sample.clientX,
      startY: sample.clientY,
      lastX: sample.clientX,
      lastY: sample.clientY
    });
    this.touchMaxPointers = Math.max(this.touchMaxPointers, this.touches.size);

    if (this.touches.size === 1 && this.host.isLassoMode()) {
      this.touchMode = 'lasso';
      this.touchLasso = true;
      this.host.beginLasso(sample.clientX, sample.clientY);
      return;
    }

    if (this.touches.size === 1 && !this.host.isAnnotationMode()) {
      // Touch may grab a vertex handle, gizmo, action, light, or camera
      // handle. A miss remains camera orbit.
      if (this.host.beginToolPointer(sample)) {
        this.touchMode = 'tool';
        return;
      }
    }

    if (this.touches.size === 2 && this.touchMode === 'lasso') {
      this.host.cancelLasso();
      this.touchLasso = false;
      this.touchMode = 'pair';
      this.captureTouchBaseline();
      return;
    }

    if (this.touchMode === 'tool' && this.touches.size >= 2) {
      this.host.cancelToolPointer();
      this.touchMode = 'blocked';
      return;
    }

    if (this.touches.size >= 3) {
      this.touchMode = 'blocked';
      return;
    }

    if (this.touches.size === 2) {
      this.touchMode = 'pair';
      this.captureTouchBaseline();
    }
  }

  private handleTouchMove(sample: PointerSample): void {
    const record = this.touches.get(sample.pointerId);
    if (!record) {
      return;
    }

    const previousX = record.lastX;
    const previousY = record.lastY;
    record.lastX = sample.clientX;
    record.lastY = sample.clientY;
    this.touchMaxTravel = Math.max(
      this.touchMaxTravel,
      Math.hypot(sample.clientX - record.startX, sample.clientY - record.startY)
    );

    if (this.touchInvalidated || this.touchMode === 'blocked') {
      return;
    }

    if (this.touchMode === 'tool' && this.touches.size === 1) {
      this.host.moveToolPointer(sample);
      return;
    }

    if (this.touchMode === 'lasso' && this.touches.size === 1) {
      this.host.moveLasso(sample.clientX, sample.clientY);
      return;
    }

    if (this.touches.size === 1) {
      if (this.touchMode === 'pending') {
        if (this.touchMaxTravel >= CAMERA_START_TRAVEL_CSS) {
          this.touchMode = 'single';
          this.touchCameraMoved = true;
        }
        return;
      }

      if (this.touchMode === 'single') {
        this.host.orbit(
          sample.clientX - previousX,
          sample.clientY - previousY
        );
      }
      return;
    }

    if (this.touches.size === 2 && this.touchMode === 'pair') {
      this.updatePairTouchCamera();
    }
  }

  private handleTouchUp(event: PointerEvent): void {
    this.touches.delete(event.pointerId);

    if (this.touchLasso) {
      if (this.touches.size > 0) {
        this.host.cancelLasso();
      } else {
        this.host.endLasso(event.clientX, event.clientY);
      }
      this.touchLasso = false;
      this.clearTouchGesture();
      return;
    }

    if (this.touchMode === 'tool') {
      if (this.touches.size > 0) {
        this.host.cancelToolPointer();
      } else {
        const sample = this.toSample(event);
        if (sample) {
          this.host.endToolPointer(sample);
        }
      }
      this.clearTouchGesture();
      return;
    }

    if (this.touches.size > 0) {
      if (this.touches.size === 1) {
        // Do not resume one-finger orbit after a multi-touch gesture; wait for
        // a clean gesture start. This avoids a camera jump at the end of a
        // pinch or tap.
        this.touchMode = 'blocked';
      } else if (this.touches.size === 2) {
        this.captureTouchBaseline();
      }
      return;
    }

    this.finishTouchGesture(event.clientX, event.clientY);
  }

  private updatePairTouchCamera(): void {
    const centroid = this.getTouchCentroid();
    if (!this.touchCameraMoved) {
      if (this.touchMaxTravel >= CAMERA_START_TRAVEL_CSS) {
        this.touchCameraMoved = true;
      }
      this.captureTouchBaseline();
      return;
    }

    const dx = centroid.x - this.lastCentroidX;
    const dy = centroid.y - this.lastCentroidY;
    const pinchFactor =
      this.lastPinchDistance > 0.001
        ? this.lastPinchDistance / Math.max(centroid.spread, 1)
        : 1;

    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      this.host.pan(dx, dy);
    }
    if (Math.abs(pinchFactor - 1) > 0.001) {
      this.host.zoom(Math.min(2, Math.max(0.5, pinchFactor)));
    }

    this.captureTouchBaseline();
  }

  private captureTouchBaseline(): void {
    const centroid = this.getTouchCentroid();
    this.lastCentroidX = centroid.x;
    this.lastCentroidY = centroid.y;
    this.lastPinchDistance = centroid.spread;
  }

  private getTouchCentroid(): TouchCentroid {
    let x = 0;
    let y = 0;
    let count = 0;
    let spread = 0;
    const records = [...this.touches.values()];

    for (const record of records) {
      x += record.lastX;
      y += record.lastY;
      count += 1;
    }

    if (count > 0) {
      x /= count;
      y /= count;
    }
    if (records.length >= 2) {
      spread = Math.hypot(
        records[0].lastX - records[1].lastX,
        records[0].lastY - records[1].lastY
      );
    }

    return { x, y, spread };
  }

  private finishTouchGesture(x: number, y: number): void {
    const duration = performance.now() - this.touchStartedAt;
    const isValidTap =
      !this.touchInvalidated &&
      !this.touchCameraMoved &&
      duration <= TAP_MAX_DURATION_MS &&
      this.touchMaxTravel <= TAP_MAX_TRAVEL_CSS;

    if (isValidTap && this.touchMaxPointers === 1) {
      // A deliberate one-finger tap selects; a drag remains orbit. The sticky
      // Add mode supplies the additive behavior because touch has no modifier
      // keys. Annotation mode is Pencil/mouse only.
      if (!this.host.isAnnotationMode()) {
        this.host.tapSelect(x, y);
      }
    } else if (isValidTap && this.touchMaxPointers === 2) {
      this.host.undo();
    } else if (isValidTap && this.touchMaxPointers === 3) {
      this.host.redo();
    }

    this.lastTouchUpAt = performance.now();
    this.touchMode = 'none';
    this.touchMaxPointers = 0;
    this.touchMaxTravel = 0;
    this.touchCameraMoved = false;
    this.touchInvalidated = false;
    this.lastCentroidX = 0;
    this.lastCentroidY = 0;
    this.lastPinchDistance = 0;
  }

  private invalidateActiveTouchGesture(): void {
    if (this.touches.size > 0) {
      if (this.touchLasso) {
        this.host.cancelLasso();
        this.touchLasso = false;
      }
      this.touchMode = 'blocked';
      this.touchInvalidated = true;
    }
  }

  private clearTouchGesture(): void {
    if (this.touchLasso) {
      this.host.cancelLasso();
      this.touchLasso = false;
    }
    this.touches.clear();
    this.ignoredTouches.clear();
    this.touchMode = 'none';
    this.touchMaxPointers = 0;
    this.touchMaxTravel = 0;
    this.touchCameraMoved = false;
    this.touchInvalidated = false;
  }

  private resetMouseGesture(pointerId: number): void {
    if (this.mouse.pointerId === pointerId) {
      this.mouse.mode = 'none';
      this.mouse.pointerId = null;
    }
  }

  private releasePointerCapture(pointerId: number): void {
    try {
      if (this.element.hasPointerCapture(pointerId)) {
        this.element.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture may already have been lost after a system gesture.
    }
  }

  private toSample(event: PointerEvent): PointerSample | null {
    let pointerType: PointerSample['pointerType'];
    if (event.pointerType === 'pen') {
      pointerType = 'pen';
    } else if (event.pointerType === 'touch') {
      pointerType = 'touch';
    } else if (event.pointerType === 'mouse') {
      pointerType = 'mouse';
    } else {
      return null;
    }

    return {
      pointerId: event.pointerId,
      pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      pressure: Math.min(1, Math.max(0, event.pressure)),
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey
    };
  }
}
