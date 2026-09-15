import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as LucideIcons from 'lucide-react';

/**
 * Normalizes an SVG string for use as a category icon in FinTrack.
 * 
 * - Strips <style> tags and inline style="..." attributes.
 * - Removes full-canvas background rects/circles that block squircle backgrounds.
 * - Replaces hardcoded fill and stroke colors with currentColor (preserving fill="none" / stroke="none").
 * - Calculates proportional stroke-width relative to the viewBox dimension:
 *   (e.g., 2px on a 24x24 canvas becomes ~42.7px on a 512x512 canvas, matching Lucide stroke weight 1:1).
 * - Ensures scalable viewBox (preserves original or defaults to "0 0 24 24").
 * - Forces width="100%" height="100%" preserveAspectRatio="xMidYMid meet".
 */
export function normalizeCategorySvg(rawSvg) {
  if (!rawSvg || typeof rawSvg !== 'string') return '';
  let svg = rawSvg.trim();

  // Extract <svg>...</svg> block if wrapped in markdown, html, or other tags
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

  // 5. Determine canvas dimensions to scale stroke-width proportionally
  let vbMax = 24;
  const vbMatch = svg.match(/viewBox\s*=\s*['"]\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*['"]/i);
  if (vbMatch) {
    const vbW = parseFloat(vbMatch[3]);
    const vbH = parseFloat(vbMatch[4]);
    vbMax = Math.max(vbW, vbH) || 24;
  } else {
    // If no viewBox, check width and height on root tag
    const wMatch = svg.match(/<svg\b[^>]*\bwidth\s*=\s*['"]([\d.]+)['"]/i);
    const hMatch = svg.match(/<svg\b[^>]*\bheight\s*=\s*['"]([\d.]+)['"]/i);
    if (wMatch && hMatch) {
      const rawW = parseFloat(wMatch[1]);
      const rawH = parseFloat(hMatch[1]);
      vbMax = Math.max(rawW, rawH) || 24;
      // Add missing viewBox from dimensions
      svg = svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${rawW} ${rawH}" `);
    }
  }

  // Desired stroke width matching Lucide's 2px on a 24x24 canvas (ratio = 2 / 24 = 1/12)
  const proportionalStroke = Number(((vbMax / 24) * 2).toFixed(2));

  // 6. Check if the SVG is primarily an outline/stroke icon or a solid/fill icon
  const hasFills = /fill\s*=\s*['"](?!none)/i.test(svg);
  const hasStrokes = /stroke\s*=\s*['"](?!none)/i.test(svg);

  // 7. Normalize fill attributes:
  // If fill="none", keep it. If fill has hardcoded color, replace with "currentColor".
  svg = svg.replace(/\s*fill\s*=\s*(['"])(.*?)\1/gi, (match, quote, val) => {
    const cleanVal = val.trim().toLowerCase();
    if (cleanVal === 'none') return ' fill="none"';
    return ' fill="currentColor"';
  });

  // 8. Normalize stroke attributes:
  // If stroke="none", keep it. If stroke has a color, replace with "currentColor".
  svg = svg.replace(/\s*stroke\s*=\s*(['"])(.*?)\1/gi, (match, quote, val) => {
    const cleanVal = val.trim().toLowerCase();
    if (cleanVal === 'none') return ' stroke="none"';
    return ' stroke="currentColor"';
  });

  // 9. Normalize stroke-width proportionally
  svg = svg.replace(/\s*stroke-width\s*=\s*(['"]).*?\1/gi, ` stroke-width="${proportionalStroke}"`);
  svg = svg.replace(/\s*stroke-linecap\s*=\s*(['"]).*?\1/gi, ' stroke-linecap="round"');
  svg = svg.replace(/\s*stroke-linejoin\s*=\s*(['"]).*?\1/gi, ' stroke-linejoin="round"');

  // 10. Clean root <svg> tag attributes:
  svg = svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let cleanAttrs = attrs
      .replace(/\s*width\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*height\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*class\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*preserveAspectRatio\s*=\s*(['"]).*?\1/gi, '');

    // Ensure viewBox exists
    if (!/viewBox/i.test(cleanAttrs)) {
      cleanAttrs += ' viewBox="0 0 24 24"';
    }

    // Ensure scalable responsive container attributes
    cleanAttrs += ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;display:block;"';

    // Ensure stroke defaults if it was an outline icon without root attributes
    if (!/stroke\s*=/i.test(cleanAttrs) && (!hasFills || hasStrokes)) {
      cleanAttrs += ` stroke="currentColor" fill="none" stroke-width="${proportionalStroke}" stroke-linecap="round" stroke-linejoin="round"`;
    }

    return `<svg${cleanAttrs}>`;
  });

  return svg.trim();
}

/**
 * Case-insensitive icon lookup supporting kebab-case, snake_case, and lowercase.
 */
function findLucideIcon(name) {
  if (!name || typeof name !== 'string') return LucideIcons.Tag;
  if (LucideIcons[name]) return LucideIcons[name];

  // PascalCase conversion (e.g. shopping-bag -> ShoppingBag)
  const pascal = name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  if (LucideIcons[pascal]) return LucideIcons[pascal];

  // Case-insensitive lookup
  const clean = name.toLowerCase().replace(/[-_\s]/g, '');
  for (const key of Object.keys(LucideIcons)) {
    if (key.toLowerCase() === clean) return LucideIcons[key];
  }

  return LucideIcons.Tag;
}

/**
 * Returns clean, pristine SVG markup for any Lucide icon name.
 * Used to pre-populate the SVG code for categories and subcategories in the editor.
 */
export function getIconSvgMarkup(iconName = 'Tag') {
  try {
    const Icon = findLucideIcon(iconName);
    if (!Icon) return '';
    const raw = renderToStaticMarkup(React.createElement(Icon, { size: 24, strokeWidth: 2 }));
    
    // Clean up internal react/lucide class artifacts for a pure SVG snippet
    return raw
      .replace(/\s*class\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*xmlns\s*=\s*(['"]).*?\1/gi, 'xmlns="http://www.w3.org/2000/svg"')
      .trim();
  } catch (err) {
    console.error('Failed to generate SVG for icon', iconName, err);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`;
  }
}

