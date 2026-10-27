// JSDOM gaps the editor stack hits at runtime: prosemirror-view reads the
// selection through ShadowRoot.getSelection() and feature-detects beforeinput
// support via document.execCommand — both are missing in JSDOM, and both are
// needed to simulate caret placement inside the shadow-root editor.

export function installJsdomEditorPolyfills(window) {
  if (typeof window.document.execCommand !== 'function') {
    window.document.execCommand = () => false;
  }
  if (!window.ShadowRoot.prototype.getSelection) {
    window.ShadowRoot.prototype.getSelection = function () {
      return this.ownerDocument.getSelection();
    };
  }
}
