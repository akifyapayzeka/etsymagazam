/** Deterministic (non-AI) personal-use digital license text bundled with every product. */
export function buildLicenseText(productTitle: string, brandName: string): string {
  return `PERSONAL USE LICENSE
${productTitle}
${brandName}

This is a DIGITAL product. No physical item will be shipped.

By purchasing this listing, you are granted a non-exclusive, non-transferable
license to:
  - Download and print this file for your own personal or event use.
  - Print as many copies as you need for your own use.

You may NOT:
  - Resell, redistribute, or share the digital files themselves.
  - Claim the design as your own or resell printed copies commercially.
  - Use this design to create a product for sale (print-on-demand, etc.).

All designs remain the copyright of ${brandName}. Thank you for supporting
a small, independently-run digital shop.

Questions about your order? Reach out via Etsy Messages and we'll help.
`;
}
