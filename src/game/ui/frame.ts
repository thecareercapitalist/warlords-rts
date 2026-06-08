// Ornate gothic 9-slice frame rendering for HUD/menu panels. The source sprite
// (assets.frameSprite) is a hollow rectangular border: corners stay crisp while
// the four edge rails stretch to fit. The centre is transparent so whatever was
// drawn under the frame (the panel fill) shows through.

interface Rectish {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draw a 9-slice border around `rect` using `img`.
 * @param srcInset fraction (0..0.5) of the source used for each corner.
 * @param destCorner on-screen corner size in px (defaults to a sensible clamp).
 */
export function draw9Slice(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  rect: Rectish,
  srcInset = 0.17,
  destCorner?: number,
): void {
  const sw = (img as HTMLCanvasElement).width;
  const sh = (img as HTMLCanvasElement).height;
  if (!sw || !sh) return;

  const si = Math.min(sw, sh) * srcInset; // source corner box (square-ish)
  const dc = Math.max(8, Math.min(destCorner ?? 40, rect.w / 2 - 1, rect.h / 2 - 1));

  const { x, y, w, h } = rect;
  const sMidW = sw - si * 2;
  const sMidH = sh - si * 2;
  const dMidW = w - dc * 2;
  const dMidH = h - dc * 2;

  // Corners (crisp, unstretched-ratio).
  ctx.drawImage(img, 0, 0, si, si, x, y, dc, dc); // TL
  ctx.drawImage(img, sw - si, 0, si, si, x + w - dc, y, dc, dc); // TR
  ctx.drawImage(img, 0, sh - si, si, si, x, y + h - dc, dc, dc); // BL
  ctx.drawImage(img, sw - si, sh - si, si, si, x + w - dc, y + h - dc, dc, dc); // BR

  // Edges (stretched along their length).
  if (dMidW > 0 && sMidW > 0) {
    ctx.drawImage(img, si, 0, sMidW, si, x + dc, y, dMidW, dc); // top
    ctx.drawImage(img, si, sh - si, sMidW, si, x + dc, y + h - dc, dMidW, dc); // bottom
  }
  if (dMidH > 0 && sMidH > 0) {
    ctx.drawImage(img, 0, si, si, sMidH, x, y + dc, dc, dMidH); // left
    ctx.drawImage(img, sw - si, si, si, sMidH, x + w - dc, y + dc, dc, dMidH); // right
  }
}

/** Draw just the four ornate corner brackets (no edge rails) — for wide HUD bars
 * where stretching the rail/crest would smear. */
export function drawCorners(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  rect: Rectish,
  size = 26,
): void {
  const sw = (img as HTMLCanvasElement).width;
  const sh = (img as HTMLCanvasElement).height;
  if (!sw || !sh) return;
  const si = Math.min(sw, sh) * 0.2;
  const dc = Math.min(size, rect.w / 2 - 1, rect.h / 2 - 1);
  const { x, y, w, h } = rect;
  ctx.drawImage(img, 0, 0, si, si, x, y, dc, dc); // TL
  ctx.drawImage(img, sw - si, 0, si, si, x + w - dc, y, dc, dc); // TR
  ctx.drawImage(img, 0, sh - si, si, si, x, y + h - dc, dc, dc); // BL
  ctx.drawImage(img, sw - si, sh - si, si, si, x + w - dc, y + h - dc, dc, dc); // BR
}
