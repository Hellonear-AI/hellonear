// Mintlify loads every .js file in this folder on every page. Its tab titles read "Page - HelloNear" and
// docs.json has no setting for the separator, so this rewrites them as "Page | HelloNear", like the web
// app's "Chat | HelloNear" (Ancung, 13 Nov). Only the browser tab changes: what the server sends (search
// engines, link previews) keeps Mintlify's own title. It runs again whenever Mintlify changes the title
// on a page change.
(function () {
  var SUFFIX = " - HelloNear";
  var fix = function () {
    var t = document.title;
    if (t.slice(-SUFFIX.length) === SUFFIX) document.title = t.slice(0, -SUFFIX.length) + " | HelloNear";
  };
  fix();
  var head = document.querySelector("head");
  if (head) new MutationObserver(fix).observe(head, { subtree: true, childList: true, characterData: true });
})();
