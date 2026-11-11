// The phone header's Live view button and the chat it opens are in different parts of the tree
// (the header is the shell's, the drawer the chat page's), so they meet through one window event.

const EVENT = "hellonear:live-view"

export const openLiveDrawer = () => window.dispatchEvent(new Event(EVENT))

/** Run `open` when the header asks for the live view; returns the cleanup. */
export function onLiveDrawer(open: () => void): () => void {
  window.addEventListener(EVENT, open)
  return () => window.removeEventListener(EVENT, open)
}
