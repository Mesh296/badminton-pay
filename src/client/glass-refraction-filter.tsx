// SVG filters that bend things near a glass element's edges, like a lens.
// - #glass-refract bends the real backdrop through backdrop-filter, which only
//   Chromium renders (see base.css and main.tsx).
// - #glass-bend gives the same bend to a copy of the tabs drawn inside the
//   tab-bar lens, through ordinary `filter`; used in WebKit (Safari, iPhone).
//
// The map image tells the filter how far to shift each pixel: red = horizontal,
// blue = vertical. Mid-gray in the middle means "no shift", so the center stays
// true and only the rim bends. The still zone is kept wide (84% x 80%) so a tab's
// icon and label are never warped while the lens rests on them. Green is
// mid-gray everywhere: a channel that never shifts, used by #glass-bend's
// one-axis passes. Sizes are fractions of the element's own box
// (objectBoundingBox), so the same filter fits the tab-bar lens and the round button.

const MAP_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>
  <defs>
    <linearGradient id='r' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='#ff8000'/><stop offset='1' stop-color='#008000'/></linearGradient>
    <linearGradient id='b' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#00f'/><stop offset='1' stop-color='#000'/></linearGradient>
    <filter id='soft' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='4'/></filter>
  </defs>
  <rect width='100' height='100' fill='url(#r)'/>
  <rect width='100' height='100' fill='url(#b)' style='mix-blend-mode:screen'/>
  <rect x='8' y='10' width='84' height='80' rx='36' fill='#808080' filter='url(#soft)'/>
</svg>`;

const MAP_URL = `data:image/svg+xml,${encodeURIComponent(MAP_SVG.replace(/\s+/g, " ").trim())}`;

/** How strongly the rim bends, as a fraction of the element's size. */
const STRENGTH = 0.2;

/**
 * WebKit measures a bounding-box filter by everything inside the element,
 * including the copy of the tabs as it slides past the lens, so the map would
 * drift off-centre. A fixed transparent frame (.lens-frame) makes that box
 * constant: the lens plus FRAME_SIDE lens widths on each side. The map is
 * placed in the middle part of it, and the sideways pull is scaled down by the
 * same factor.
 */
const FRAME_SIDE = 2;
const FRAME_SPAN = 1 + 2 * FRAME_SIDE;

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
      {/* The same bend for the copy of the tabs inside the lens, with ordinary
          `filter`. Bounding-box units on purpose: WebKit places user-space
          filter regions away from HTML elements and draws nothing. Two passes,
          because the box is FRAME_SPAN times wider than the lens but just as
          tall: one pulls sideways, the other up and down. */}
      <filter
        id="glass-bend"
        x="0"
        y="0"
        width="1"
        height="1"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          x={FRAME_SIDE / FRAME_SPAN}
          y="0"
          width={1 / FRAME_SPAN}
          height="1"
          preserveAspectRatio="none"
          result="map"
          href={MAP_URL}
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale={STRENGTH / FRAME_SPAN}
          xChannelSelector="R"
          yChannelSelector="G"
          result="sideways"
        />
        <feDisplacementMap in="sideways" in2="map" scale={STRENGTH} xChannelSelector="G" yChannelSelector="B" />
      </filter>
    </svg>
  );
}
