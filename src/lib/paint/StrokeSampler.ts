import { pressureResponse } from './brush';
import type { PaintSample } from './types';

/** One GPU-ready dab in texture pixels. */
export interface StrokeDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly aspect: number;
  readonly angle: number;
  readonly flow: number;
}

/** Sampling inputs shared by texture-pane and projected strokes. */
export interface StrokeSamplerSettings {
  readonly radius: number;
  readonly spacing: number;
  readonly smoothing: number;
  readonly noise: number;
  readonly pressureOpacity: boolean;
  readonly pressureCurve: number;
  readonly pressureMin: number;
  readonly tiltEnabled: boolean;
  readonly taperIn: number;
  readonly random: () => number;
}

/**
 * Convert a sequence of texture-space pointer samples into evenly spaced dabs.
 *
 * This is the single stroke scheduler used by both paint surfaces. The caller
 * only has to supply texture-space points: the pane maps CSS coordinates and
 * projection maps surface UVs. Spacing is measured by arc length and follows
 * the pressure-adjusted diameter, so pointer-event rate cannot change the
 * visible stamp density.
 */
export class StrokeSampler {
  private last: PaintSample | null = null;
  private filtered: PaintSample | null = null;
  private carry = 0;
  private distance = 0;

  constructor(private readonly settings: StrokeSamplerSettings) {}

  /** Begin a gesture and emit its initial dab. */
  begin(sample: PaintSample): StrokeDab[] {
    this.last = sample;
    this.filtered = sample;
    this.carry = 0;
    this.distance = 0;
    return [this.makeDab(sample, sample, 0)];
  }

  /** Add one texture-space sample and return the dabs for the new segment. */
  add(sample: PaintSample): StrokeDab[] {
    if (!this.last || !this.filtered) {
      return this.begin(sample);
    }
    const smoothing = Math.min(
      0.96,
      Math.max(0, this.settings.smoothing) * 0.9
    );
    const next: PaintSample = {
      x: this.filtered.x + (sample.x - this.filtered.x) * (1 - smoothing),
      y: this.filtered.y + (sample.y - this.filtered.y) * (1 - smoothing),
      pressure: sample.pressure,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY
    };
    const dabs = this.walk(this.last, next, this.distance);
    this.distance += Math.hypot(next.x - this.last.x, next.y - this.last.y);
    this.last = next;
    this.filtered = next;
    return dabs;
  }

  /**
   * Break stroke continuity after a surface miss or UV-island boundary.
   *
   * The coverage mask remains alive for the gesture; only the distance carry
   * and smoothing state reset, so the next hit starts a fresh segment without
   * connecting across unrelated texture space.
   */
  reset(sample: PaintSample): StrokeDab[] {
    this.last = sample;
    this.filtered = sample;
    this.carry = 0;
    this.distance = 0;
    return [this.makeDab(sample, sample, 0)];
  }

  /** Emit a final dab at the current filtered endpoint. */
  finish(): StrokeDab[] {
    if (!this.last) {
      return [];
    }
    return [this.makeDab(this.last, this.last, this.distance)];
  }

  private walk(
    from: PaintSample,
    to: PaintSample,
    startDistance: number
  ): StrokeDab[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) {
      return [];
    }
    const dabs: StrokeDab[] = [];
    let traveled = this.carry;
    let iterations = 0;
    while (traveled <= length && iterations < 4096) {
      iterations += 1;
      const t = traveled / length;
      const point: PaintSample = {
        x: from.x + dx * t,
        y: from.y + dy * t,
        pressure: from.pressure + (to.pressure - from.pressure) * t,
        tiltX:
          (from.tiltX ?? 0) + ((to.tiltX ?? 0) - (from.tiltX ?? 0)) * t,
        tiltY:
          (from.tiltY ?? 0) + ((to.tiltY ?? 0) - (from.tiltY ?? 0)) * t
      };
      dabs.push(this.makeDab(point, from, startDistance + traveled));
      traveled += this.spacingFor(point.pressure);
    }
    this.carry = Math.max(0, traveled - length);
    return dabs;
  }

  private taper(distance: number): number {
    const length = Math.max(0, this.settings.taperIn);
    if (length <= 0) {
      return 1;
    }
    const t = Math.min(1, distance / length);
    return 0.2 + 0.8 * t;
  }

  private spacingFor(pressure: number): number {
    return Math.max(
      1,
      this.settings.radius *
        pressureResponse(
          pressure,
          this.settings.pressureCurve,
          this.settings.pressureMin
        ) *
        2 *
        Math.min(2, Math.max(0.02, this.settings.spacing))
    );
  }

  private makeDab(
    point: PaintSample,
    from: PaintSample,
    distance: number
  ): StrokeDab {
    const noise = Math.min(1, Math.max(0, this.settings.noise));
    const jitterX =
      (this.settings.random() - 0.5) * this.settings.radius * noise * 0.7;
    const jitterY =
      (this.settings.random() - 0.5) * this.settings.radius * noise * 0.7;
    const sizeJitter = 1 + (this.settings.random() - 0.5) * noise * 0.45;
    const pressure = Math.min(1, Math.max(0, point.pressure));
    const response = pressureResponse(
      pressure,
      this.settings.pressureCurve,
      this.settings.pressureMin
    );
    const taper = this.taper(distance);
    const tiltX = point.tiltX ?? from.tiltX ?? 0;
    const tiltY = point.tiltY ?? from.tiltY ?? 0;
    const tiltMagnitude = this.settings.tiltEnabled
      ? Math.min(1, Math.hypot(tiltX, tiltY) / 90)
      : 0;
    const flow =
      (this.settings.pressureOpacity ? response : 1) *
      taper *
      (1 - this.settings.random() * noise * 0.35);
    return {
      x: point.x + jitterX,
      y: point.y + jitterY,
      radius: Math.max(
        0.5,
        this.settings.radius * response * taper * sizeJitter
      ),
      aspect: 1 - tiltMagnitude * 0.55,
      angle: Math.atan2(tiltY, tiltX),
      flow: Math.min(1, Math.max(0, flow))
    };
  }
}
