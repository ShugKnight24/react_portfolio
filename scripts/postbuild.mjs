// GitHub Pages has no SPA fallback, so after `vite build`:
// - build/404.html is a copy of index.html. GH Pages serves it for any unknown path
//   (with a 404 status), the app boots and BrowserRouter renders the route.
// - build/<route>.html is written for each top-level route with that route's title,
//   description, canonical and og/twitter tags. GH Pages serves /projects from
//   projects.html with a 200, so crawlers and link unfurlers (which do not run JS)
//   see the right metadata.
import { readFileSync, writeFileSync } from 'node:fs';

const buildDir = new URL('../build/', import.meta.url);
const { site, routes } = JSON.parse(
  readFileSync(new URL('../src/data/routeMeta.json', import.meta.url), 'utf8')
);
// Old URLs that render the About & Contact page
const aliases = { '/about': '/aboutcontact', '/contact': '/aboutcontact' };

// Home's LCP preload (and its comment) only belongs on the home page
const html = readFileSync(new URL('index.html', buildDir), 'utf8').replace(
  /\s*<!--[^>]*data-home-only[\s\S]*?-->\s*<link[^>]*data-home-only[^>]*>/,
  ''
);
writeFileSync(new URL('404.html', buildDir), html);

const escape = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const setAttr = (doc, selector, attr, value) => {
  const tag = selector.split(' ').join('\\s+');
  const pattern = new RegExp(`(<${tag}[^>]*?\\s${attr}=")[^"]*(")`);
  if (!pattern.test(doc)) throw new Error(`postbuild: ${selector} not found in index.html`);
  return doc.replace(pattern, `$1${escape(value)}$2`);
};

const render = (path, canonicalPath) => {
  const meta = { ...site, ...routes[canonicalPath] };
  const url = `${site.url}${canonicalPath}`;
  const image = `${site.url}${meta.image}`;
  let doc = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`);
  for (const [selector, attr, value] of [
    ['meta name="description"', 'content', meta.description],
    ['link rel="canonical"', 'href', url],
    ['meta property="og:title"', 'content', meta.title],
    ['meta property="og:description"', 'content', meta.description],
    ['meta property="og:url"', 'content', url],
    ['meta property="og:image"', 'content', image],
    ['meta property="og:image:alt"', 'content', meta.imageAlt],
    ['meta name="twitter:title"', 'content', meta.title],
    ['meta name="twitter:description"', 'content', meta.description],
    ['meta name="twitter:image"', 'content', image],
    ['meta name="twitter:image:alt"', 'content', meta.imageAlt],
  ]) {
    doc = setAttr(doc, selector, attr, value);
  }
  writeFileSync(new URL(`${path.slice(1)}.html`, buildDir), doc);
};

const pages = Object.keys(routes).filter((path) => path !== '/');
pages.forEach((path) => render(path, path));
Object.entries(aliases).forEach(([path, target]) => render(path, target));
console.log(`postbuild: wrote 404.html and ${pages.length + Object.keys(aliases).length} route pages`);
