import { Color, SRGBColorSpace } from 'three';

/** A color token resolved to a Three.js color plus its source alpha. */
export interface ThemeColor {
  readonly css: string;
  readonly color: Color;
  readonly alpha: number;
}

/** Viewport and chrome colors read once from the CSS design tokens. */
export interface Theme {
  readonly canvas: ThemeColor;
  readonly gridMinor: ThemeColor;
  readonly gridMajor: ThemeColor;
  readonly axisX: ThemeColor;
  readonly axisY: ThemeColor;
  readonly axisZ: ThemeColor;
  readonly wireframe: ThemeColor;
  readonly vertexHandle: ThemeColor;
  readonly accent: ThemeColor;
  readonly solidMaterial: ThemeColor;
  readonly textureA: ThemeColor;
  readonly textureB: ThemeColor;
  readonly keyLight: ThemeColor;
  readonly fillLight: ThemeColor;
}

const FALLBACKS: Record<string, string> = {
  '--bg-canvas': '#121214',
  '--grid-minor': 'rgba(255, 255, 255, 0.065)',
  '--grid-major': 'rgba(255, 255, 255, 0.12)',
  '--axis-x': '#ff6b7d',
  '--axis-y': '#9bdd72',
  '--axis-z': '#71a8ff',
  '--wireframe-edge': 'rgba(242, 239, 230, 0.26)',
  '--vertex-handle': 'rgba(242, 239, 230, 0.62)',
  '--accent-primary': '#c9f45c',
  '--material-solid': '#cec8b9',
  '--material-texture-a': '#263129',
  '--material-texture-b': '#c8c2ad',
  '--viewport-key-light': '#fff2dc',
  '--viewport-fill-light': '#8eb6ff'
};

/**
 * Read a CSS custom property and convert it to a Three.js color.
 *
 * Theme colors are sourced from the same tokens as the UI; no duplicate TS
 * palette is maintained. The alpha channel is tracked separately because
 * Three.js colors do not carry opacity.
 */
function readToken(name: string): ThemeColor {
  const rootStyle = getComputedStyle(document.documentElement);
  const css = rootStyle.getPropertyValue(name).trim() || FALLBACKS[name] || '#ffffff';
  const color = new Color().setStyle(stripAlpha(css), SRGBColorSpace);
  return { css, color, alpha: readAlpha(css) };
}

/**
 * Strip a CSS alpha component before handing a color to Three.js.
 *
 * Three.js colors have no alpha channel and log a warning for rgba inputs. The
 * alpha is captured separately and applied through the owning material.
 */
function stripAlpha(css: string): string {
  const rgba = css.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
  }

  const hex = css.match(/^#([\da-f]{4}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1];
    return digits.length === 4
      ? `#${digits.slice(0, 3)}`
      : `#${digits.slice(0, 6)}`;
  }

  return css;
}

/** Extract a CSS alpha component for rgba/8-digit-hex tokens. */
function readAlpha(css: string): number {
  const rgba = css.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 4) {
      const alpha = Number(parts[3]);
      return Number.isFinite(alpha) ? alpha : 1;
    }
    return 1;
  }

  const hex = css.match(/^#([\da-f]{4}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1];
    const alphaHex = digits.length === 4 ? digits[3] + digits[3] : digits.slice(6, 8);
    const alpha = Number.parseInt(alphaHex, 16) / 255;
    return Number.isFinite(alpha) ? alpha : 1;
  }

  return 1;
}

/** Resolve the complete viewport theme from CSS. Call after the document mounts. */
export function readTheme(): Theme {
  return {
    canvas: readToken('--bg-canvas'),
    gridMinor: readToken('--grid-minor'),
    gridMajor: readToken('--grid-major'),
    axisX: readToken('--axis-x'),
    axisY: readToken('--axis-y'),
    axisZ: readToken('--axis-z'),
    wireframe: readToken('--wireframe-edge'),
    vertexHandle: readToken('--vertex-handle'),
    accent: readToken('--accent-primary'),
    solidMaterial: readToken('--material-solid'),
    textureA: readToken('--material-texture-a'),
    textureB: readToken('--material-texture-b'),
    keyLight: readToken('--viewport-key-light'),
    fillLight: readToken('--viewport-fill-light')
  };
}
