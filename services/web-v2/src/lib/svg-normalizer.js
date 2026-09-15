import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as LucideIcons from 'lucide-react';

/**
 * Normalizes an SVG string for use as a category icon in FinTrack.
 * 
 * - Strips <style> tags and inline style="..." attributes.
 * - Removes full-canvas background rects/circles that block squircle backgrounds.
 * - Replaces hardcoded fill and stroke colors with currentColor (preserving fill="none" / stroke="none").
 * - Ensures stroke-width="2", stroke-linecap="round", stroke-linejoin="round".
 * - Ensures scalable viewBox (preserves original or defaults to "0 0 24 24").
 * - Forces width="100%" height="100%" preserveAspectRatio="xMidYMid meet" and max-width/max-height.
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

  // 3. Remove inline style attributes that set colors/fills/strokes/dimensions
  svg = svg.replace(/\s*style\s*=\s*(['"])(.*?)\1/gi, '');

  // 4. Remove background rectangles (e.g. width="100%" or full canvas-covering rects)
  svg = svg.replace(/<rect[^>]*(?:width\s*=\s*['"](?:100%|24|100|512|64|800)['"][^>]*height\s*=\s*['"](?:100%|24|100|512|64|800)['"][^>]*|fill\s*=\s*['"](?:#fff|#ffffff|white|#000|#000000|black|none)['"][^>]*)[^>]*\/?>/gi, (match) => {
    if (/fill\s*=\s*['"]none['"]/i.test(match) && /stroke/i.test(match)) {
      return match; // keep outline rects that are part of the icon
    }
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
  // Set width="100%" and height="100%" so container CSS controls dimensions strictly
  svg = svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let cleanAttrs = attrs
      .replace(/\s*width\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*height\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*preserveAspectRatio\s*=\s*(['"]).*?\1/gi, '');

    // Ensure viewBox exists
    if (!/viewBox/i.test(cleanAttrs)) {
      cleanAttrs += ' viewBox="0 0 24 24"';
    }

    // Ensure scalable responsive container attributes
    cleanAttrs += ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;display:block;"';

    // Ensure stroke defaults if it was an outline icon without root attributes
    if (!/stroke\s*=/i.test(cleanAttrs) && !hasFills) {
      cleanAttrs += ' stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    }

    return `<svg${cleanAttrs}>`;
  });

  return svg.trim();
}

/**
 * Returns clean normalized SVG markup for any Lucide icon name.
 * Used to pre-populate the SVG code for categories and subcategories in the editor.
 */
export function getIconSvgMarkup(iconName = 'Tag') {
  try {
    const Icon = LucideIcons[iconName] || LucideIcons.Tag || LucideIcons.HelpCircle;
    if (!Icon) return '';
    const raw = renderToStaticMarkup(React.createElement(Icon, { size: 24, strokeWidth: 2 }));
    return normalizeCategorySvg(raw);
  } catch (err) {
    console.error('Failed to generate SVG for icon', iconName, err);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;display:block;"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><path d="M7 7h.01"></path></svg>`;
  }
}
