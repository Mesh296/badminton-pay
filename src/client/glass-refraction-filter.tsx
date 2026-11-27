// SVG filter that bends what is behind a glass element near its edges, like a
// lens. Referenced from CSS as url(#glass-refract) inside backdrop-filter, which
// only Chromium renders (see base.css and main.tsx).
//
// The map image tells the filter how far to shift each pixel: red = horizontal,
// blue = vertical. Mid-gray in the middle means "no shift", so the center stays
// true and only the rim bends. The still zone is kept wide (84% x 80%) so a tab's
// icon and label are never warped while the lens rests on them. Sizes are fractions of the element's own box
// (objectBoundingBox), so the same filter fits the tab-bar lens and the round button.

const MAP_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>
  <defs>
    <linearGradient id='r' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='#f00'/><stop offset='1' stop-color='#000'/></linearGradient>
    <linearGradient id='b' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#00f'/><stop offset='1' stop-color='#000'/></linearGradient>
    <filter id='soft' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='4'/></filter>
  </defs>
  <rect width='100' height='100' fill='#000'/>
  <rect width='100' height='100' fill='url(#r)'/>
  <rect width='100' height='100' fill='url(#b)' style='mix-blend-mode:screen'/>
  <rect x='8' y='10' width='84' height='80' rx='36' fill='#808080' filter='url(#soft)'/>
</svg>`;

const MAP_URL = `data:image/svg+xml,${encodeURIComponent(MAP_SVG.replace(/\s+/g, " ").trim())}`;

/** How strongly the rim bends the backdrop, as a fraction of the element's size. */
const STRENGTH = 0.2;

export function GlassRefractionFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter
        id="glass-refract"
        x="0"
        y="0"
        width="1"
        height="1"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" href={MAP_URL} />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={STRENGTH} xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}
