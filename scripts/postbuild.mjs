// GitHub Pages has no SPA fallback. build/404.html is a copy of index.html: GH Pages serves
// it for any unknown path (with a 404 status), the app boots and BrowserRouter renders the route.
import { copyFileSync } from 'node:fs';

const buildDir = new URL('../build/', import.meta.url);
copyFileSync(new URL('index.html', buildDir), new URL('404.html', buildDir));
console.log('postbuild: wrote 404.html');
