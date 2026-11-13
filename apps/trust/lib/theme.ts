// The Trust Center's theme choice (light or dark), kept on this device. Plain module so the server layout can
// inline the script (a "use client" module's exports reach the server as references, not strings).
export const THEME_KEY = "hellonear.trust.theme";

// Runs in <head> before the page paints, so a saved theme shows from the first frame.
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
