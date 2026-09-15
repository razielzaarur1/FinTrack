/**
 * Normalizes an SVG string for use as a category icon in FinTrack.
 * 
 * - Strips <style> tags and inline style="..." attributes.
 * - Removes full-canvas background rects/circles that block squircle backgrounds.
 * - Replaces hardcoded fill and stroke colors with currentColor (preserving fill="none").
 * - Ensures stroke-width="2", stroke-linecap="round", stroke-linejoin="round".
 * - Ensures scalable viewBox ("0 0 24 24" default if missing).
 * - Removes fixed width/height attributes so the SVG scales with container CSS.
 */
export function normalizeCategorySvg(rawSvg) {
  if (!rawSvg || typeof rawSvg !== 'string') return '';
  let svg = rawSvg.trim();

  // Extract <svg>...</svg> block if wrapped in markdown or other tags
  const svgMatch = svg.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    svg = svgMatch[0];
  } else {
    return '';
  }

  // 1. Remove XML declarations, DOCTYPE, and comments
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '');
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Remove <style>...</style> blocks
  svg = svg.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 3. Remove inline style attributes that set colors/fills/strokes
  svg = svg.replace(/\s*style\s*=\s*(['"])(.*?)\1/gi, () => '');

  // 4. Remove background rectangles (e.g. width="100%" or full 24x24 / canvas-covering rects)
  svg = svg.replace(/<rect[^>]*(?:width\s*=\s*['"](?:100%|24|100|512|64)['"][^>]*height\s*=\s*['"](?:100%|24|100|512|64)['"][^>]*|fill\s*=\s*['"](?:#fff|#ffffff|white|#000|#000000|black|none)['"][^>]*)[^>]*\/?>/gi, (match) => {
    // Check if it's an outline rectangle or a full background block
    if (/fill\s*=\s*['"](?:none)['"]/i.test(match) && /stroke/i.test(match)) {
      return match; // keep outline rects that are part of the icon
    }
    // Otherwise it's likely a background tile, remove it
    return '';
  });

  // 5. Check if the SVG is primarily an outline/stroke icon or a solid/fill icon
  const hasFills = /fill\s*=\s*['"](?!none)/i.test(svg);

  // 6. Normalize fill attributes:
  // If fill="none", keep it. If fill has hardcoded color, replace with "currentColor".
  svg = svg.replace(/\s*fill\s*=\s*(['"])(.*?)\1/gi, (match, quote, val) => {
    const cleanVal = val.trim().toLowerCase();
    if (cleanVal === 'none') return ' fill="none"';
    return ' fill="currentColor"';
  });

  // 7. Normalize stroke attributes:
  // If stroke="none", keep it. If stroke has a color, replace with "currentColor".
  svg = svg.replace(/\s*stroke\s*=\s*(['"])(.*?)\1/gi, (match, quote, val) => {
    const cleanVal = val.trim().toLowerCase();
    if (cleanVal === 'none') return ' stroke="none"';
    return ' stroke="currentColor"';
  });

  // 8. Normalize stroke-width, stroke-linecap, stroke-linejoin
  svg = svg.replace(/\s*stroke-width\s*=\s*(['"]).*?\1/gi, ' stroke-width="2"');
  svg = svg.replace(/\s*stroke-linecap\s*=\s*(['"]).*?\1/gi, ' stroke-linecap="round"');
  svg = svg.replace(/\s*stroke-linejoin\s*=\s*(['"]).*?\1/gi, ' stroke-linejoin="round"');

  // 9. Clean root <svg> tag attributes:
  // Remove width and height attributes so container CSS controls dimensions
  svg = svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let cleanAttrs = attrs
      .replace(/\s*width\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*height\s*=\s*(['"]).*?\1/gi, '');

    // Ensure viewBox exists
    if (!/viewBox/i.test(cleanAttrs)) {
      cleanAttrs += ' viewBox="0 0 24 24"';
    }

    // Ensure stroke defaults if it was an outline icon without root attributes
    if (!/stroke\s*=/i.test(cleanAttrs) && !hasFills) {
      cleanAttrs += ' stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    }

    return `<svg${cleanAttrs}>`;
  });

  return svg.trim();
}
