import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import routeMeta from '../data/routeMeta.json';

// Keeps the document title, description, canonical and share tags in step with the route.
// The same table feeds scripts/postbuild.mjs, which bakes them into the static HTML that
// crawlers and link previews see.

interface Meta {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}

const { site, routes } = routeMeta as {
  site: Meta & { url: string; name: string };
  routes: Record<string, Partial<Meta>>;
};

// Old URLs that render the About & Contact page
const aliases: Record<string, string> = { '/about': '/aboutcontact', '/contact': '/aboutcontact' };

const setAttr = (selector: string, attr: string, value: string) =>
  document.head.querySelector(selector)?.setAttribute(attr, value);

const setTitle = (title: string) => {
  document.title = title;
  setAttr('meta[property="og:title"]', 'content', title);
  setAttr('meta[name="twitter:title"]', 'content', title);
};

const setDescription = (description: string) => {
  setAttr('meta[name="description"]', 'content', description);
  setAttr('meta[property="og:description"]', 'content', description);
  setAttr('meta[name="twitter:description"]', 'content', description);
};

/** Route-level metadata. A layout effect, so pages can refine it from their own effects. */
export const useRouteMeta = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const canonicalPath = aliases[path] ?? path;
    const section = canonicalPath === '/' ? '/' : `/${canonicalPath.split('/')[1]}`;
    const meta: Meta =
      section in routes
        ? { ...site, ...routes[section] }
        : { ...site, title: `Page not found | ${site.name}` };
    const url = `${site.url}${canonicalPath}`;
    const image = `${site.url}${meta.image}`;

    setTitle(meta.title);
    setDescription(meta.description);
    setAttr('link[rel="canonical"]', 'href', url);
    setAttr('meta[property="og:url"]', 'content', url);
    setAttr('meta[property="og:image"]', 'content', image);
    setAttr('meta[name="twitter:image"]', 'content', image);
    setAttr('meta[property="og:image:alt"]', 'content', meta.imageAlt);
    setAttr('meta[name="twitter:image:alt"]', 'content', meta.imageAlt);
  }, [pathname]);
};

/** Names the open item (a film, a scene) in the title, e.g. "Inception | Fun | Shugmi Shumunov" */
export const usePageTitle = (title: string | undefined, description?: string) => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!title) return;
    setTitle(`${title} | ${site.name}`);
    if (description) setDescription(description);
  }, [title, description, pathname]);
};
