/**
 * `navigator.clipboard` only exists in secure contexts, and the web UI is
 * routinely served over plain HTTP on a LAN address. Fall back to the legacy
 * command so the copy action works there too.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  const clipboard =
    typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available on this platform.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  try {
    textarea.select();
    if (!document.execCommand("copy")) {
      throw new Error("The browser blocked the copy command.");
    }
  } finally {
    document.body.removeChild(textarea);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}
