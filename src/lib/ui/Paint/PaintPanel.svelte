<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';
  import PaintToolbar from './PaintToolbar.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionMenu from '../Primitives/ActionMenu.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import { paintPressure, type PaintSample } from '../../paint/types';
  import { paintBounds } from '../../texture/paintView';

  /** Session projection for the dedicated texture-paint workspace. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let painting = $state(false);
  let activePointerId: number | null = null;
  let brushX = $state(0);
  let brushY = $state(0);
  let brushVisible = $state(false);
  let panning = false;
  let panPointerId: number | null = null;
  let panLastX = 0;
  let panLastY = 0;
  let pinchActive = false;
  let pinchLastCenter = { x: 0, y: 0 };
  let pinchLastDistance = 0;
  let penActive = false;
  let activePointerType: string | null = null;
  let lastPenUpAt = -Infinity;
  const touchPointers = new Map<number, { x: number; y: number }>();
  const PEN_TOUCH_COOLDOWN_MS = 350;
  const pendingPaintSamples: PaintSample[] = [];
  let paintFrame = 0;

  const textureAssets = $derived(session.snapshot.textureAssets);
  const activeAsset = $derived(
    textureAssets.find((asset) => asset.id === session.snapshot.textureAssetId) ?? null
  );
  const brushSize = $derived.by(() => {
    if (!activeAsset || width <= 0 || height <= 0) {
      return 2;
    }
    const bounds = paintBounds(
      width,
      height,
      activeAsset.width,
      activeAsset.height,
      24,
      {
        zoom: session.snapshot.paintZoom,
        panX: session.snapshot.paintPanX,
        panY: session.snapshot.paintPanY
      }
    );
    return Math.max(
      2,
      (session.snapshot.uvBrushSize / activeAsset.width) * bounds.width
    );
  });
  const activeLayer = $derived(
    session.snapshot.textureLayers.find(
      (layer) => layer.id === session.snapshot.textureActiveId
    ) ?? null
  );
  const activeEditor = $derived(session.snapshot.activeEditor);
  const imagePlacement = $derived(session.snapshot.imagePlacement);
  const canReplaceLayer = $derived(activeLayer?.kind === 'raster');
  const placementAngle = $derived(
    imagePlacement ? (imagePlacement.rotation * 180) / Math.PI : 0
  );

  const placementFrame = $derived.by(() => {
    const placement = imagePlacement;
    if (!placement || width <= 0 || height <= 0) {
      return null;
    }
    const bounds = paintBounds(
      width,
      height,
      placement.textureWidth,
      placement.textureHeight,
      24,
      {
        zoom: session.snapshot.paintZoom,
        panX: session.snapshot.paintPanX,
        panY: session.snapshot.paintPanY
      }
    );
    const scaleX = bounds.width / Math.max(1, placement.textureWidth);
    const scaleY = bounds.height / Math.max(1, placement.textureHeight);
    const centerX = bounds.x + placement.x * scaleX;
    const centerY = bounds.y + placement.y * scaleY;
    const halfWidth = Math.max(1, (placement.width * scaleX) / 2);
    const halfHeight = Math.max(1, (placement.height * scaleY) / 2);
    const rotate = (x: number, y: number): { x: number; y: number } => {
      const cos = Math.cos(placement.rotation);
      const sin = Math.sin(placement.rotation);
      return {
        x: centerX + x * cos - y * sin,
        y: centerY + x * sin + y * cos
      };
    };
    return {
      bounds,
      centerX,
      centerY,
      halfWidth,
      halfHeight,
      rotation: placement.rotation,
      corners: [
        rotate(-halfWidth, -halfHeight),
        rotate(halfWidth, -halfHeight),
        rotate(halfWidth, halfHeight),
        rotate(-halfWidth, halfHeight)
      ],
      rotationHandle: rotate(0, -halfHeight - 30)
    };
  });

  type PlacementDrag = {
    mode: 'move' | 'scale' | 'rotate';
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startRotation: number;
    startDistance: number;
    startAngle: number;
  };
  let placementDrag = $state<PlacementDrag | null>(null);
  const placementTouches = new Map<number, { x: number; y: number }>();
  let placementPinch = $state<{
    ids: [number, number];
    startCenter: { x: number; y: number };
    startDistance: number;
    startAngle: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startRotation: number;
    boundsWidth: number;
    boundsHeight: number;
    textureWidth: number;
    textureHeight: number;
  } | null>(null);
  let dragActive = $state(false);


  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      width = rect.width;
      height = rect.height;
    });
    observer.observe(host);
    window.addEventListener('paste', pasteImage);
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        settleForBackground();
      } else {
        scheduleResumeRedraw();
      }
    };
    const onPageShow = (): void => scheduleResumeRedraw();
    const onFocus = (): void => scheduleResumeRedraw();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      discardPaintSamples();
    };
  });

  onDestroy(() => {
    discardPaintSamples();
    detachPointer();
    detachTouchTracking();
  });

  function schedulePaintFrame(): void {
    if (paintFrame !== 0) {
      return;
    }
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      flushPaintSamples();
    });
  }

  /**
   * Apply one frame of coalesced Pencil samples.
   *
   * The runtime refreshes the texture and publishes the editor snapshot once
   * for the whole batch instead of once per Pencil sample.
   */
  function flushPaintSamples(): void {
    if (paintFrame !== 0) {
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
    }
    if (pendingPaintSamples.length === 0 || !painting) {
      return;
    }
    const samples = pendingPaintSamples.splice(0);
    session.updateTexturePaintBatch(samples, width, height);
  }

  function discardPaintSamples(): void {
    pendingPaintSamples.length = 0;
    if (paintFrame !== 0) {
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
    }
  }

  function measureAndDraw(): void {
    if (!host || !canvas) {
      return;
    }
    const rect = host.getBoundingClientRect();
    if (rect.width > 0) {
      width = rect.width;
    }
    if (rect.height > 0) {
      height = rect.height;
    }
    if (width > 0 && height > 0) {
      session.drawPaintView(canvas, width, height);
    }
  }

  function scheduleResumeRedraw(): void {
    requestAnimationFrame(() => {
      measureAndDraw();
    });
  }

  /** Close a stroke cleanly before iOS suspends the WebView. */
  function settleForBackground(): void {
    if (painting) {
      endPointer(true);
    } else {
      discardPaintSamples();
    }
    stopPaintPan();
    detachTouchTracking();
    brushVisible = false;
  }

  $effect(() => {
    if (!imagePlacement) {
      cancelPlacementGestures();
    }
  });

  onDestroy(() => {
    cancelPlacementGestures();
    window.removeEventListener('paste', pasteImage);
  });

  $effect(() => {
    session.snapshot.uvRevision;
    session.snapshot.textureAssetId;
    session.snapshot.textureActiveId;
    session.snapshot.textureLayers.length;
    session.snapshot.paintUvOverlay;
    session.snapshot.activeNodeId;
    if (canvas && width > 0 && height > 0) {
      session.drawPaintView(canvas, width, height);
    }
  });

  function localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function pressureOf(event: PointerEvent): number {
    return paintPressure(event.pointerType, event.pressure);
  }

  function tiltOf(event: PointerEvent): { x: number; y: number } {
    return event.pointerType === 'pen'
      ? { x: event.tiltX, y: event.tiltY }
      : { x: 0, y: 0 };
  }

  /** Coalesced Pencil samples, with the final event included exactly once. */
  function coalescedPointerEvents(event: PointerEvent): PointerEvent[] {
    const events: PointerEvent[] = [];
    if (
      event.pointerType !== 'touch' &&
      typeof event.getCoalescedEvents === 'function'
    ) {
      try {
        for (const sample of event.getCoalescedEvents()) {
          if (sample.pointerId === event.pointerId) {
            events.push(sample);
          }
        }
      } catch {
        // Coalesced events are optional; the current event remains enough.
      }
    }
    if (events[events.length - 1] !== event) {
      events.push(event);
    }
    return events;
  }

  function placementHit(
    x: number,
    y: number,
    point: { x: number; y: number },
    radius = 24
  ): boolean {
    return Math.hypot(point.x - x, point.y - y) <= radius;
  }

  function placementTexturePoint(point: { x: number; y: number }): {
    x: number;
    y: number;
  } | null {
    const frame = placementFrame;
    const placement = imagePlacement;
    if (!frame || !placement) {
      return null;
    }
    return {
      x: ((point.x - frame.bounds.x) / frame.bounds.width) * placement.textureWidth,
      y: ((point.y - frame.bounds.y) / frame.bounds.height) * placement.textureHeight
    };
  }

  function cancelPlacementGestures(): void {
    if (placementDrag) {
      window.removeEventListener('pointermove', placementMove);
      window.removeEventListener('pointerup', placementUp);
      window.removeEventListener('pointercancel', placementUp);
      try {
        if (canvas?.hasPointerCapture(placementDrag.pointerId)) {
          canvas.releasePointerCapture(placementDrag.pointerId);
        }
      } catch {
        // Capture may already be released.
      }
    }
    placementDrag = null;
    window.removeEventListener('pointermove', placementTouchMove);
    window.removeEventListener('pointerup', placementTouchUp);
    window.removeEventListener('pointercancel', placementTouchUp);
    placementPinch = null;
    placementTouches.clear();
  }

  function placementTouchDown(event: PointerEvent): void {
    const point = localPoint(event);
    placementTouches.set(event.pointerId, point);
    if (placementTouches.size === 1) {
      beginPlacementPointer(event);
      return;
    }
    if (placementTouches.size !== 2) {
      return;
    }
    event.preventDefault();
    if (placementDrag) {
      window.removeEventListener('pointermove', placementMove);
      window.removeEventListener('pointerup', placementUp);
      window.removeEventListener('pointercancel', placementUp);
      placementDrag = null;
    }
    const points = [...placementTouches.values()];
    const frame = placementFrame;
    const placement = imagePlacement;
    if (!frame || !placement || points.length < 2) {
      return;
    }
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    placementPinch = {
      ids: [...placementTouches.keys()] as [number, number],
      startCenter: center,
      startDistance: Math.max(
        1,
        Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      ),
      startAngle: Math.atan2(
        points[1].y - points[0].y,
        points[1].x - points[0].x
      ),
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height,
      startRotation: placement.rotation,
      boundsWidth: frame.bounds.width,
      boundsHeight: frame.bounds.height,
      textureWidth: placement.textureWidth,
      textureHeight: placement.textureHeight
    };
    window.addEventListener('pointermove', placementTouchMove);
    window.addEventListener('pointerup', placementTouchUp);
    window.addEventListener('pointercancel', placementTouchUp);
  }

  function placementTouchMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !placementTouches.has(event.pointerId)) {
      return;
    }
    placementTouches.set(event.pointerId, localPoint(event));
    const pinch = placementPinch;
    if (!pinch || placementTouches.size < 2) {
      return;
    }
    event.preventDefault();
    const points = [...placementTouches.values()];
    if (points.length < 2) {
      return;
    }
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    const distance = Math.max(
      1,
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
    );
    const angle = Math.atan2(
      points[1].y - points[0].y,
      points[1].x - points[0].x
    );
    let deltaAngle = angle - pinch.startAngle;
    while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
    const scale = distance / pinch.startDistance;
    session.updateImagePlacement({
      x:
        pinch.startX +
        ((center.x - pinch.startCenter.x) / pinch.boundsWidth) *
          pinch.textureWidth,
      y:
        pinch.startY +
        ((center.y - pinch.startCenter.y) / pinch.boundsHeight) *
          pinch.textureHeight,
      width: pinch.startWidth * scale,
      height: pinch.startHeight * scale,
      rotation: pinch.startRotation + deltaAngle
    });
  }

  function placementTouchUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      return;
    }
    placementTouches.delete(event.pointerId);
    if (placementPinch && placementTouches.size < 2) {
      window.removeEventListener('pointermove', placementTouchMove);
      window.removeEventListener('pointerup', placementTouchUp);
      window.removeEventListener('pointercancel', placementTouchUp);
      placementPinch = null;
    }
    if (placementTouches.size === 0) {
      placementTouches.clear();
    }
  }

  function imageDrop(event: DragEvent): void {
    event.preventDefault();
    dragActive = false;
    const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
      item.type.startsWith('image/')
    );
    if (!file) {
      return;
    }
    void session.beginImagePlacement(file, file.name.replace(/\.[^.]+$/, ''), {
      mode: 'contain'
    });
  }

  function imageDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    dragActive = true;
  }

  function pasteImage(event: ClipboardEvent): void {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active?.getAttribute('contenteditable') === 'true'
    ) {
      return;
    }
    const file = [...(event.clipboardData?.files ?? [])].find((item) =>
      item.type.startsWith('image/')
    );
    if (!file) {
      return;
    }
    event.preventDefault();
    canvas?.focus({ preventScroll: true });
    void session.beginImagePlacement(file, 'Pasted image', { mode: 'contain' });
  }

  function beginPlacementPointer(event: PointerEvent): boolean {
    const frame = placementFrame;
    const placement = imagePlacement;
    if (!frame || !placement || placementDrag) {
      return false;
    }
    const point = localPoint(event);
    const dx = point.x - frame.centerX;
    const dy = point.y - frame.centerY;
    const cos = Math.cos(frame.rotation);
    const sin = Math.sin(frame.rotation);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    const onRotation = placementHit(
      frame.rotationHandle.x,
      frame.rotationHandle.y,
      point
    );
    const onCorner = frame.corners.some((corner) =>
      placementHit(corner.x, corner.y, point)
    );
    const inside =
      Math.abs(localX) <= frame.halfWidth + 4 &&
      Math.abs(localY) <= frame.halfHeight + 4;
    if (!onRotation && !onCorner && !inside) {
      return false;
    }
    event.preventDefault();
    session.setActiveEditor('paint');
    canvas.focus({ preventScroll: true });
    const texturePoint = placementTexturePoint(point) ?? {
      x: placement.x,
      y: placement.y
    };
    const startDistance = Math.max(1, Math.hypot(dx, dy));
    placementDrag = {
      mode: onRotation ? 'rotate' : onCorner ? 'scale' : 'move',
      pointerId: event.pointerId,
      startClientX: point.x,
      startClientY: point.y,
      startX: texturePoint.x,
      startY: texturePoint.y,
      startWidth: placement.width,
      startHeight: placement.height,
      startRotation: placement.rotation,
      startDistance,
      startAngle: Math.atan2(dy, dx)
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; window listeners still receive the gesture.
    }
    window.addEventListener('pointermove', placementMove);
    window.addEventListener('pointerup', placementUp);
    window.addEventListener('pointercancel', placementUp);
    return true;
  }

  function placementMove(event: PointerEvent): void {
    const drag = placementDrag;
    const placement = imagePlacement;
    if (!drag || !placement || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    if (drag.mode === 'move') {
      const current = placementTexturePoint(point);
      if (!current) {
        return;
      }
      session.updateImagePlacement({
        x: placement.x + current.x - drag.startX,
        y: placement.y + current.y - drag.startY
      });
      drag.startX = current.x;
      drag.startY = current.y;
      return;
    }
    const frame = placementFrame;
    if (!frame) {
      return;
    }
    const dx = point.x - frame.centerX;
    const dy = point.y - frame.centerY;
    if (drag.mode === 'scale') {
      const factor = Math.max(
        0.05,
        Math.hypot(dx, dy) / drag.startDistance
      );
      session.updateImagePlacement({
        width: drag.startWidth * factor,
        height: drag.startHeight * factor
      });
      return;
    }
    const angle = Math.atan2(dy, dx);
    let delta = angle - drag.startAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    session.updateImagePlacement({
      rotation: drag.startRotation + delta
    });
  }

  function placementUp(event: PointerEvent): void {
    if (!placementDrag || event.pointerId !== placementDrag.pointerId) {
      return;
    }
    window.removeEventListener('pointermove', placementMove);
    window.removeEventListener('pointerup', placementUp);
    window.removeEventListener('pointercancel', placementUp);
    try {
      if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already be released.
    }
    placementDrag = null;
  }

  function pointerDown(event: PointerEvent): void {
    if (imagePlacement) {
      if (event.pointerType === 'touch') {
        placementTouchDown(event);
      } else {
        beginPlacementPointer(event);
      }
      return;
    }
    if (event.pointerType === 'pen') {
      penActive = true;
      // A missed pointerup from a previous pencil stroke must be committed
      // before starting another stroke, not silently discarded.
      if (painting) {
        endPointer(true);
      }
      if (touchPointers.size > 0) {
        detachTouchTracking();
      }
    } else if (event.pointerType === 'touch') {
      if (
        penActive ||
        performance.now() - lastPenUpAt < PEN_TOUCH_COOLDOWN_MS
      ) {
        return;
      }
      const point = localPoint(event);
      touchPointers.set(event.pointerId, point);
      if (touchPointers.size === 1) {
        attachTouchTracking();
      } else if (touchPointers.size === 2) {
        event.preventDefault();
        if (painting) {
          endPointer(false);
        }
        stopPaintPan();
        beginPinch();
        return;
      } else {
        return;
      }
      if (session.pencilMode) {
        // Navigation is two-finger only in both panes. A single finger in
        // Pencil mode neither paints nor pans.
        event.preventDefault();
        return;
      }
    }
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      beginPaintPan(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    session.setActiveEditor('paint');
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    const tilt = tiltOf(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
    if (
      !session.beginTexturePaint(
        point.x,
        point.y,
        width,
        height,
        pressureOf(event),
        tilt.x,
        tilt.y
      )
    ) {
      if (event.pointerType === 'pen') {
        penActive = false;
        lastPenUpAt = performance.now();
      }
      return;
    }
    painting = true;
    activePointerId = event.pointerId;
    activePointerType = event.pointerType;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners still cover the gesture.
    }
    window.addEventListener('pointermove', windowPointerMove);
    window.addEventListener('pointerup', windowPointerUp);
    window.addEventListener('pointercancel', windowPointerCancel);
  }

  function pointerTrack(event: PointerEvent): void {
    const point = localPoint(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
  }

  function windowPointerMove(event: PointerEvent): void {
    const samePen =
      event.pointerType === 'pen' && activePointerType === 'pen';
    if (
      !painting ||
      (event.pointerId !== activePointerId && !samePen) ||
      (event.pointerType === 'touch' && touchPointers.size > 1)
    ) {
      return;
    }
    event.preventDefault();
    const samples = coalescedPointerEvents(event);
    for (const sample of samples) {
      const point = localPoint(sample);
      const tilt = tiltOf(sample);
      brushX = point.x;
      brushY = point.y;
      pendingPaintSamples.push({
        x: point.x,
        y: point.y,
        pressure: pressureOf(sample),
        tiltX: tilt.x,
        tiltY: tilt.y
      });
    }
    schedulePaintFrame();
  }

  function windowPointerUp(event: PointerEvent): void {
    const samePen =
      event.pointerType === 'pen' && activePointerType === 'pen';
    if (event.pointerId !== activePointerId && !samePen) {
      return;
    }
    if (event.pointerType === 'pen' || activePointerType === 'pen') {
      penActive = false;
      lastPenUpAt = performance.now();
    }
    endPointer(true);
  }

  function windowPointerCancel(event: PointerEvent): void {
    const samePen =
      event.pointerType === 'pen' && activePointerType === 'pen';
    if (event.pointerId !== activePointerId && !samePen) {
      return;
    }
    if (event.pointerType === 'pen' || activePointerType === 'pen') {
      penActive = false;
      lastPenUpAt = performance.now();
    }
    endPointer(false);
  }

  function endPointer(commit: boolean): void {
    const wasPainting = painting;
    if (wasPainting && commit) {
      flushPaintSamples();
    } else {
      discardPaintSamples();
    }
    detachPointer();
    painting = false;
    if (wasPainting && commit) {
      session.finishTexturePaint();
    } else if (wasPainting) {
      session.cancelTexturePaint();
    }
  }

  function detachPointer(): void {
    window.removeEventListener('pointermove', windowPointerMove);
    window.removeEventListener('pointerup', windowPointerUp);
    window.removeEventListener('pointercancel', windowPointerCancel);
    if (canvas && activePointerId !== null) {
      try {
        if (canvas.hasPointerCapture(activePointerId)) {
          canvas.releasePointerCapture(activePointerId);
        }
      } catch {
        // The capture may already have been released by the system.
      }
    }
    activePointerId = null;
    activePointerType = null;
  }

  function attachTouchTracking(): void {
    window.addEventListener('pointermove', windowTouchMove);
    window.addEventListener('pointerup', windowTouchUp);
    window.addEventListener('pointercancel', windowTouchUp);
  }

  function detachTouchTracking(): void {
    window.removeEventListener('pointermove', windowTouchMove);
    window.removeEventListener('pointerup', windowTouchUp);
    window.removeEventListener('pointercancel', windowTouchUp);
    touchPointers.clear();
    pinchActive = false;
  }

  function touchPoints(): [{ x: number; y: number }, { x: number; y: number }] | null {
    const points = [...touchPointers.values()];
    return points.length >= 2 ? [points[0], points[1]] : null;
  }

  function beginPinch(): void {
    const points = touchPoints();
    if (!points) {
      return;
    }
    pinchActive = true;
    pinchLastCenter = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    pinchLastDistance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );
    brushVisible = false;
  }

  function windowTouchMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !touchPointers.has(event.pointerId)) {
      return;
    }
    touchPointers.set(event.pointerId, localPoint(event));
    const points = touchPoints();
    if (!points || !pinchActive) {
      return;
    }
    event.preventDefault();
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    const distance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );
    if (pinchLastDistance > 0) {
      session.zoomPaint(
        distance / pinchLastDistance,
        center.x,
        center.y,
        width,
        height
      );
    }
    session.panPaint(
      center.x - pinchLastCenter.x,
      center.y - pinchLastCenter.y
    );
    pinchLastCenter = center;
    pinchLastDistance = distance;
  }

  function windowTouchUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      return;
    }
    touchPointers.delete(event.pointerId);
    if (touchPointers.size < 2) {
      pinchActive = false;
    }
    if (touchPointers.size === 0) {
      detachTouchTracking();
    }
  }

  function beginPaintPan(event: PointerEvent): void {
    panning = true;
    panPointerId = event.pointerId;
    panLastX = event.clientX;
    panLastY = event.clientY;
    window.addEventListener('pointermove', windowPanMove);
    window.addEventListener('pointerup', windowPanUp);
    window.addEventListener('pointercancel', windowPanUp);
  }

  function windowPanMove(event: PointerEvent): void {
    if (!panning || event.pointerId !== panPointerId) {
      return;
    }
    event.preventDefault();
    session.panPaint(event.clientX - panLastX, event.clientY - panLastY);
    panLastX = event.clientX;
    panLastY = event.clientY;
  }

  function stopPaintPan(): void {
    if (!panning) {
      return;
    }
    panning = false;
    panPointerId = null;
    window.removeEventListener('pointermove', windowPanMove);
    window.removeEventListener('pointerup', windowPanUp);
    window.removeEventListener('pointercancel', windowPanUp);
  }

  function windowPanUp(event: PointerEvent): void {
    if (event.pointerId !== panPointerId) {
      return;
    }
    stopPaintPan();
  }

  function wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = localPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    session.zoomPaint(factor, point.x, point.y, width, height);
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (imagePlacement) {
      if (event.key === 'Escape') {
        event.preventDefault();
        session.cancelImagePlacement();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        session.commitImagePlacement();
      }
      return;
    }
    const paintKey: Record<string, 'brush' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'gradient' | 'fill'> = {
      b: 'brush',
      e: 'eraser',
      l: 'line',
      r: 'rectangle',
      o: 'ellipse',
      g: 'gradient',
      f: 'fill'
    };
    const tool = paintKey[event.key.toLowerCase()];
    if (tool) {
      event.preventDefault();
      session.setPaintTool(tool);
      return;
    }
    if (event.key !== 'Escape') {
      return;
    }
    if (painting) {
      event.preventDefault();
      endPointer(false);
    }
  }




</script>

{#snippet paintHeader()}
  <PaneHeader
    label="Paint"
    active={activeEditor === 'paint'}
    detail={activeAsset ? `${activeAsset.name} · ${activeLayer?.name ?? 'No layer'}` : activeLayer?.name ?? 'No layer'}
    meta={`${activeAsset?.width ?? 0} × ${activeAsset?.height ?? 0} · ${activeLayer?.kind ?? '—'}`}
  />
{/snippet}

{#snippet paintToolbar()}
  <PaintToolbar {session} />
{/snippet}

{#snippet paintFooter()}
  <div class="paint-foot">
    {#if imagePlacement}
      <span class="paint-hint">
        Drag the image to move · corner handles scale · top handle rotates · Enter commits · Esc cancels
      </span>
      <label class="placement-angle">
        <span>Angle</span>
        <NumberField
          label="Image rotation"
          value={placementAngle}
          step={1}
          precision={1}
          unit="°"
          onCommit={(degrees) =>
            session.updateImagePlacement({ rotation: (degrees * Math.PI) / 180 })}
        />
      </label>
      <label class="placement-opacity">
        <span>Opacity</span>
        <NumberField
          label="Image opacity"
          value={imagePlacement.opacity * 100}
          min={0}
          max={100}
          step={1}
          precision={0}
          unit="%"
          onCommit={(percent) =>
            session.updateImagePlacement({ opacity: percent / 100 })}
        />
      </label>
      <ActionMenu
        label={`Layer: ${imagePlacement.replaceActive ? 'Replace' : 'New'}`}
        icon="image"
        menuTitle="Placement layer"
        options={[
          {
            label: 'New layer',
            onSelect: () => session.updateImagePlacement({ replaceActive: false })
          },
          {
            label: 'Replace active raster',
            disabled: !canReplaceLayer,
            onSelect: () => session.updateImagePlacement({ replaceActive: true })
          }
        ]}
      />
      <div class="placement-actions">
        <ActionButton
          label="Cancel"
          icon="close"
          onActivate={() => session.cancelImagePlacement()}
        />
        <ActionButton
          label="Place image"
          icon="checker"
          variant="primary"
          onActivate={() => session.commitImagePlacement()}
        />
      </div>
    {:else}
      <span class="paint-hint">
        {#if !activeLayer}
          Add a texture layer in the Inspector
        {:else}
          Drag the model or texture to paint · MMB/Alt orbit · RMB pan · wheel zoom
        {/if}
      </span>
    {/if}
  </div>
{/snippet}

<PaneFrame
  label="Paint editor"
  header={paintHeader}
  toolbar={paintToolbar}
  footer={paintFooter}
>

  <div
    class="paint-stage"
    class:drag-active={dragActive}
    role="group"
    aria-label="Texture paint area"
    bind:this={host}
    ondragover={imageDragOver}
    ondragleave={() => (dragActive = false)}
    ondrop={imageDrop}
  >
    <canvas
      bind:this={canvas}
      class="paint-canvas"
      class:placing={imagePlacement !== null}
      tabindex="0"
      aria-label="Texture paint surface"
      onpointerdown={pointerDown}
      onpointerup={windowPointerUp}
      onpointercancel={windowPointerCancel}
      onpointermove={pointerTrack}
      onpointerenter={pointerTrack}
      onpointerleave={() => {
        if (!painting) {
          brushVisible = false;
        }
      }}
      onkeydown={keyDown}
      onwheel={wheel}
      oncontextmenu={(event) => event.preventDefault()}
    ></canvas>
    {#if imagePlacement && placementFrame}
      <div
        class="image-placement-frame"
        style={`left:${placementFrame.centerX}px;top:${placementFrame.centerY}px;width:${placementFrame.halfWidth * 2}px;height:${placementFrame.halfHeight * 2}px;transform:translate(-50%, -50%) rotate(${placementFrame.rotation}rad)`}
        aria-hidden="true"
      >
        {#each [0, 1, 2, 3] as index (index)}
          <span
            class="image-placement-handle"
            style={`left:${index === 0 || index === 3 ? '0' : '100%'};top:${index < 2 ? '0' : '100%'}`}
          ></span>
        {/each}
        <span class="image-placement-rotate-stem"></span>
        <span
          class="image-placement-rotate-handle"
          style={`left:50%;top:-30px`}
        ></span>
      </div>
    {/if}
    {#if brushVisible && !imagePlacement}
      <span
        class="brush-cursor"
        style={`left:${brushX}px;top:${brushY}px;width:${brushSize}px;height:${brushSize}px`}
        aria-hidden="true"
      ></span>
    {/if}
  </div>


</PaneFrame>

<style>








  .paint-stage {
    position: absolute;
    inset: 0;
  }

  .paint-stage.drag-active::after {
    content: 'Drop image to place';
    position: absolute;
    z-index: 3;
    inset: 12px;
    display: grid;
    place-items: center;
    border: 2px dashed var(--accent-primary);
    border-radius: var(--radius-md);
    background: rgba(18, 18, 20, 0.72);
    color: var(--accent-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    pointer-events: none;
  }

  .paint-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: none;
    touch-action: none;
  }

  .paint-canvas:focus-visible {
    outline: none;
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .brush-cursor {
    position: absolute;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .paint-canvas.placing {
    cursor: default;
  }

  .image-placement-frame {
    position: absolute;
    z-index: 2;
    border: var(--hairline) solid var(--accent-primary);
    outline: var(--hairline) solid rgba(0, 0, 0, 0.65);
    outline-offset: 1px;
    pointer-events: none;
  }

  .image-placement-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 2px;
    background: var(--bg-panel-strong);
    transform: translate(-50%, -50%);
  }

  .image-placement-rotate-stem {
    position: absolute;
    top: -30px;
    left: 50%;
    width: var(--hairline);
    height: 30px;
    background: var(--accent-primary);
    transform: translateX(-50%);
  }

  .image-placement-rotate-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 50%;
    background: var(--bg-panel-strong);
    transform: translate(-50%, -50%);
  }

  .placement-angle,
  .placement-opacity {
    display: flex;
    flex: 0 0 108px;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  .placement-angle :global(.number-field),
  .placement-opacity :global(.number-field) {
    min-width: 0;
  }

  .placement-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
  }







  .paint-foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-height: var(--status-h);
    padding: var(--space-2) var(--space-3);
  }




  .paint-hint {
    flex: 1 1 100%;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1.3;
  }
</style>
