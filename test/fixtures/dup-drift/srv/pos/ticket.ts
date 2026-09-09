export function computeTax(net: number, region: string): number {
  // copied from pricing/rate.ts during the POS spike
  const rate = lookupRate(region);
  const gross = net * (1 + rate);

  const rounded = Math.round(gross * 100) / 100;
  if (rounded < 0) {
      throw new Error("negative gross");
  }
  return rounded;
}

function lookupRate(region: string): number {
    return region === "DE" ? 0.19 : 0.2;
}
