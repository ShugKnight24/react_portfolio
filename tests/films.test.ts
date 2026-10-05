import { describe, expect, it } from 'vitest';
import { FILM_ARCHIVE, FILMS, loadFilm } from '../src/components/Animations/films';

// The reel lists each film's metadata up front so the page can render before any film code
// loads. This keeps that list honest against the film modules themselves.
describe('Animations film registry', () => {
  const all = [...FILMS, ...FILM_ARCHIVE];

  it('has unique ids', () => {
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });

  it.each(all.map((meta) => [meta.id, meta] as const))(
    '%s matches its film module',
    async (_, meta) => {
      const film = await loadFilm(meta);
      expect({
        id: meta.id,
        title: meta.title,
        caption: meta.caption,
        theme: meta.theme,
        motif: meta.motif,
        duration: meta.duration,
        paper: meta.paper,
        series: meta.series,
        category: meta.category,
        inkColors: meta.inkColors,
      }).toEqual({
        id: film.id,
        title: film.title,
        caption: film.caption,
        theme: film.theme,
        motif: film.motif,
        duration: film.duration,
        paper: film.paper,
        series: film.series,
        category: film.category,
        inkColors: film.inks.map((ink) => ink.color),
      });
    }
  );
});
