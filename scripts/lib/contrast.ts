/**
 * Contrast math for WCAG 2.2 AA auditing.
 *
 * Pipeline: oklch → OKLab (polar→cartesian) → LMS' (cube-root-compressed) →
 *   linear sRGB (Björn Ottosson's canonical matrices) → gamma-encode → clamp [0,1].
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RGBA {
  r: number; // [0,1] linear
  g: number;
  b: number;
  a: number; // [0,1]
}

export interface RGB {
  r: number; // [0,1] gamma-encoded sRGB
  g: number;
  b: number;
}

export interface OklchColor {
  l: number;
  c: number;
  h: number; // degrees
  a: number; // [0,1]
}

// ---------------------------------------------------------------------------
// oklch → linear sRGB (Björn Ottosson canonical matrices)
// ---------------------------------------------------------------------------

/** OKLab M1 inverse: Lab → LMS' */
const M1_INV = [
  [1.0, 0.3963377774, 0.2158037573],
  [1.0, -0.1055613458, -0.0638541728],
  [1.0, -0.0894841775, -1.291485548],
] as const;

/** OKLab M2 inverse: LMS → linear sRGB */
const M2_INV = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

function mat3x3(
  m: readonly (readonly number[])[],
  v: [number, number, number],
): [number, number, number] {
  return [
    m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
    m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
    m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
  ];
}

/** Convert oklch to linear sRGB (values may exceed [0,1] for out-of-gamut). */
export function oklchToLinearSRGB(l: number, c: number, hDeg: number): RGB {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // Lab → LMS' (cube-root compressed)
  const [lPrime, mPrime, sPrime] = mat3x3(M1_INV, [l, a, b]);

  // LMS' → LMS (cube)
  const lms: [number, number, number] = [lPrime! ** 3, mPrime! ** 3, sPrime! ** 3];

  // LMS → linear sRGB
  const [r, g, bv] = mat3x3(M2_INV, lms);
  return { r: r!, g: g!, b: bv! };
}

/** Gamma-encode one linear-light channel (sRGB transfer function). */
function gammaEncode(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** oklch → gamma-encoded sRGB in [0,1]. */
export function oklchToSRGB(l: number, c: number, hDeg: number): RGB {
  const lin = oklchToLinearSRGB(l, c, hDeg);
  return {
    r: gammaEncode(lin.r),
    g: gammaEncode(lin.g),
    b: gammaEncode(lin.b),
  };
}

// ---------------------------------------------------------------------------
// Alpha compositing
// ---------------------------------------------------------------------------

/** Linearise a gamma-encoded [0,1] channel for luminance calculation. */
function linearise(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Porter-Duff "src over dst": composite a semi-transparent sRGB foreground
 * over an opaque sRGB background. Returns opaque sRGB.
 */
export function composite(fg: RGBA, bg: RGB): RGB {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

// ---------------------------------------------------------------------------
// WCAG 2.2 relative luminance + contrast ratio
// ---------------------------------------------------------------------------

export function relativeLuminance(rgb: RGB): number {
  return 0.2126 * linearise(rgb.r) + 0.7152 * linearise(rgb.g) + 0.0722 * linearise(rgb.b);
}

export function wcagRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// CSS parsing
// ---------------------------------------------------------------------------

/**
 * Parse `oklch(L C H)` or `oklch(L C H / A)` values.
 * L, C may be numbers; H is degrees; A is [0,1] float.
 */
export function parseOklch(value: string): OklchColor | null {
  const m = value
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (!m) return null;
  return {
    l: parseFloat(m[1]!),
    c: parseFloat(m[2]!),
    h: parseFloat(m[3]!),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

// ---------------------------------------------------------------------------
// Theme token extraction
// ---------------------------------------------------------------------------

export type TokenMap = Record<string, string>;
export type PaletteMap = Record<string, TokenMap>;

/**
 * Extract CSS custom property values per selector block from a CSS string.
 *
 * Returns a map of `selectorKey → { tokenName → rawValue }`.
 *
 * Selector key normalisation (for our 8 palettes):
 *   - `:root` / `[data-theme="cobalt"]` → "cobalt-light"
 *   - `.dark` / `.dark[data-theme="cobalt"]` → "cobalt-dark"
 *   - `[data-theme="parchment"]` → "parchment-light"
 *   - `.dark[data-theme="parchment"]` → "parchment-dark"
 *   … etc.
 */
export function parseThemeTokens(css: string): PaletteMap {
  const palettes: PaletteMap = {};

  // Strip @media blocks entirely (we want the base tokens only)
  const stripped = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");

  // Match selector { ... } blocks, one level deep (no nesting beyond @theme)
  const blockRe = /([^{@]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(stripped)) !== null) {
    const selectorRaw = m[1]!.trim();
    const body = m[2]!;

    // A block may have comma-separated selectors (e.g. `:root,\n[data-theme="cobalt"]`)
    const subSelectors = selectorRaw.split(",").map((s) => s.trim());
    const paletteKeys = new Set<string>();
    for (const sel of subSelectors) {
      const key = selectorToKey(sel);
      if (key) paletteKeys.add(key);
    }
    if (paletteKeys.size === 0) continue;

    // Parse oklch tokens from the block body
    const tokenRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let tm: RegExpExecArray | null;
    const newTokens: TokenMap = {};
    while ((tm = tokenRe.exec(body)) !== null) {
      const name = tm[1]!.trim();
      const value = tm[2]!.trim();
      if (value.startsWith("oklch(")) {
        newTokens[name] = value;
      }
    }

    if (Object.keys(newTokens).length === 0) continue;

    // Register tokens under all matching palette keys
    for (const key of paletteKeys) {
      palettes[key] = { ...palettes[key], ...newTokens };
    }
  }

  return palettes;
}

function selectorToKey(selector: string): string | null {
  // Normalise whitespace
  const s = selector.replace(/\s+/g, " ").trim();

  // Skip utility and non-palette blocks
  if (
    s.startsWith("@") ||
    s.startsWith("html") ||
    s.startsWith("body") ||
    s.startsWith("*") ||
    s.startsWith("#") ||
    s.startsWith("button") ||
    s.startsWith("[role") ||
    s.startsWith("summary") ||
    s.startsWith("a[") ||
    s.startsWith("label") ||
    s.includes("prefers")
  ) {
    return null;
  }

  const isDark = s.includes(".dark") && !s.includes("@");

  let theme = "cobalt"; // default for :root
  const themeMatch = s.match(/data-theme="([^"]+)"/);
  if (themeMatch) {
    theme = themeMatch[1]!;
  } else if (!s.includes(":root") && !s.includes(".dark")) {
    return null;
  }

  return `${theme}-${isDark ? "dark" : "light"}`;
}

// ---------------------------------------------------------------------------
// Resolve an oklch token to a composited sRGB value
// ---------------------------------------------------------------------------

export function resolveColor(value: string, backdrop: RGB): RGB | null {
  const ok = parseOklch(value);
  if (!ok) return null;
  const srgb = oklchToSRGB(ok.l, ok.c, ok.h);
  if (ok.a < 1) {
    return composite({ ...srgb, a: ok.a }, backdrop);
  }
  return srgb;
}
