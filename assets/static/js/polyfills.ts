// Minimal runtime shim for the older-browser degraded mode. esbuild lowers modern
// *syntax* (?., ??, spread) at build time, but it does not add missing runtime
// APIs. The one DOM gap the apps can hit at the support floor is
// Element.prototype.replaceChildren (Chrome 86 / Safari 14, 2020); it's included
// as a defensive shim even in apps that don't call it directly. Everything else
// the apps use (fetch, Intl, URLSearchParams) predates the floor, so no core-js.
//
// Imported only for its side effect (installing the shim) as the first line of
// main.ts; it exports nothing.

if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function replaceChildren(
    this: Element,
    ...nodes: (Node | string)[]
  ): void {
    // Build the new children in a fragment first so a bad node throws before we
    // touch the element, keeping the swap effectively atomic like the native API.
    const frag = document.createDocumentFragment()
    frag.append(...nodes)
    while (this.firstChild) this.removeChild(this.firstChild)
    this.appendChild(frag)
  }
}
