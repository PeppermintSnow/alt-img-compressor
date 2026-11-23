enum InputSymbol {
  DESCEND = 'D',
  EXACT = 'e',
  APPROXIMATE = 'a',
  DEFERRED = 'd'
};

export const traverse = (
  pixels: number[],
  params: {
    maxDepth: number, 
    threshold: number
  }
) => {
  const structure: InputSymbol[] = [InputSymbol.DESCEND];
  const colors: number[] = [];
  const residuals: number[] = [];
  const deferredPixels: number[] = [];

  const resolve = (vPixels: number[], depth: number) => {
    // e
    const uniquePixels = [...new Set(vPixels)];
    if (uniquePixels.length === 1) {
      structure.push(InputSymbol.EXACT);
      colors.push(uniquePixels[0]);
      return;
    }

    // a
    const mean = vPixels.reduce((acc, p) => acc + p, 0) / vPixels.length;
    const variance = vPixels.reduce((acc, p) => acc + ((p - mean) ** 2), 0) / vPixels.length;
    const stddev = Math.sqrt(variance);
    if (stddev <= params.threshold) {
      const approxPixel = Math.round(mean);
      structure.push(InputSymbol.APPROXIMATE);
      colors.push(approxPixel);
      vPixels.forEach((p) => residuals.push(p - approxPixel));
      return;
    }

    // d
    if (depth >= params.maxDepth) {
      structure.push(InputSymbol.DEFERRED);
      deferredPixels.push(...vPixels);
      return;
    }

    // D
    structure.push(InputSymbol.DESCEND);
    const children = splitQuadrants(vPixels);
    children.forEach((q) => resolve(q, depth + 1));
  }

  resolve(pixels, 0);

  return {
    structure,
    colors,
    residuals,
    deferredPixels
  };
}

const splitQuadrants = (pixels: number[]) => {
  const n = Math.sqrt(pixels.length);
  
  // read TR, TL, BL, BR in order
  const q: number[][] = [];

  // top half
  for (let i = 0; i < n / 2; i++) {
    for (let j = n / 2; j < n; j++) q[0].push(pixels[(i * n) + j]);
    for (let j = 0; j < n / 2; j++) q[1].push(pixels[(i * n) + j]);
  }
  
  // bottom half
  for (let i = n / 2; i < n; i++) {
    for (let j = 0; j < n / 2; j++) q[3].push(pixels[(i * n) + j]);
    for (let j = n / 2; j < n; j++) q[4].push(pixels[(i * n) + j]);
  }

  return q;
}
