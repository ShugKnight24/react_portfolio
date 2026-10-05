import { render, screen, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { sound } from '../src/components/arcade/audio/audioSynth';
import { CharacterCreator } from '../src/components/arcade/creator/CharacterCreator';
import { defaultCharacters } from '../src/components/arcade/data/characterRoster';
import { CharacterGallery } from '../src/components/arcade/gallery/CharacterGallery';
import { SceneStudio } from '../src/components/arcade/playground/SceneStudio';
import { TamagotchiPlayground } from '../src/components/arcade/playground/TamagotchiPlayground';
import { SpriteRenderer } from '../src/components/arcade/sprites/SpriteRenderer';
import { ArcadePortfolio } from '../src/components/arcade/ArcadePortfolio';
import { resolveArcadePath } from '../src/components/arcade/hub/arcadeMap';

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

describe('Arcade & Tamagotchi System', () => {
  it('audio synthesizer toggles properly', () => {
    expect(sound.enabled).toBe(true);
    const newState = sound.toggleSound();
    expect(newState).toBe(false);
    expect(sound.enabled).toBe(false);
    sound.toggleSound(); // turn back on
    expect(sound.enabled).toBe(true);
  });

  it('default character roster includes required legends and characters', () => {
    const ids = defaultCharacters.map((c) => c.id);
    expect(ids).toContain('luna');
    expect(ids).toContain('shugmi');
    expect(ids).toContain('kobe');
    expect(ids).toContain('jordan');
    expect(ids).toContain('ovechkin');
    expect(ids).toContain('reacher');
    expect(ids).toContain('gojo');
    expect(ids).toContain('pochita');
    expect(ids).toContain('spiderman');
    expect(ids).toContain('batman');
    expect(ids).toContain('denji');
    expect(ids).toContain('saitama');
    expect(ids).toContain('ironman');
    expect(ids).toContain('hulk');
    expect(ids).toContain('vegeta');
    expect(ids).toContain('ultramarine');
    expect(ids).toContain('hydralisk');
    expect(ids).toContain('ultralisk');
    expect(ids).toContain('terranmarine');
    expect(ids).toContain('goliath');
    expect(ids).toContain('zealot');
    expect(ids).toContain('archon');
    expect(ids).toContain('darktemplar');
    expect(ids).toContain('arthas');
    expect(ids).toContain('lichking');
    expect(ids).toContain('barbarian');
    expect(ids).toContain('paladin');
    expect(ids).toContain('zed');
    expect(ids).toContain('yone');
    expect(ids).toContain('yasuo');
    expect(ids).toContain('ahri');
  });

  it('renders all 16 epic gaming character sprites without emojis', () => {
    const gamingIds = [
      'ultramarine',
      'hydralisk',
      'ultralisk',
      'terranmarine',
      'goliath',
      'zealot',
      'archon',
      'darktemplar',
      'arthas',
      'lichking',
      'barbarian',
      'paladin',
      'zed',
      'yone',
      'yasuo',
      'ahri',
    ];

    for (const gId of gamingIds) {
      const char = defaultCharacters.find((c) => c.id === gId);
      expect(char).toBeDefined();
      const { container } = render(<SpriteRenderer character={char} size={100} />);
      expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
    }
  });

  it('renders the brand marks for both personas', async () => {
    const { ShugStylizedLogo, ShugKnightEmblem } = await import('../src/components/Branding/BrandLogos');
    render(<ShugStylizedLogo size={80} />);
    expect(screen.getByAltText('SS signet').getAttribute('src')).toBe('/brand/plain/mark.svg');

    render(<ShugKnightEmblem size={80} />);
    expect(screen.getByAltText('Shug Knight crest with Luna').getAttribute('src')).toBe(
      '/brand/knight-and-luna/mark.svg'
    );
  });

  it('renders BooksShelfView digital bookshelf without emojis', async () => {
    const { BooksShelfView } = await import('../src/components/Books/BooksShelfView');
    const sampleCategories = [
      {
        categoryName: 'Philosophy & Craft',
        index: 0,
        bookList: [
          { name: 'Meditations', author: 'Marcus Aurelius', readNo: 3 },
          { name: 'The War of Art', author: 'Steven Pressfield', audioBook: true },
        ],
      },
    ];
    const { container } = render(<BooksShelfView categories={sampleCategories} />);
    expect(screen.getByText(/THE SHELF, BUT DIGITAL/i)).toBeInTheDocument();
    expect(screen.getByText(/MEDITATIONS/i)).toBeInTheDocument();
    expect(screen.getByText(/THE WAR OF ART/i)).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders SpriteRenderer with preset character', () => {
    const luna = defaultCharacters.find((c) => c.id === 'luna');
    render(<SpriteRenderer character={luna} size={100} />);
    expect(screen.getByRole('img', { name: 'Luna' })).toBeInTheDocument();
  });

  it('renders CharacterCreator with archetype presets and inputs without emojis', () => {
    const { container } = render(<CharacterCreator />);
    expect(screen.getByRole('region', { name: /Character Lab/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Signature Quote/i)).toBeInTheDocument();
    expect(screen.getByText(/SAVE TO ROSTER/i)).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders CharacterGallery with cards and filters without emojis', () => {
    const { container } = render(
      <BrowserRouter>
        <CharacterGallery onSelectCompanion={() => {}} />
      </BrowserRouter>
    );
    expect(screen.getByText(/ROSTER & LEGENDS GALLERY/i)).toBeInTheDocument();
    expect(screen.getByText(/Kobe Bryant/i)).toBeInTheDocument();
    expect(screen.getByText(/Michael Jordan/i)).toBeInTheDocument();
    expect(screen.getByText(/Alex Ovechkin/i)).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders TamagotchiPlayground with HUD vitals and actions without emojis', () => {
    const { container } = render(
      <BrowserRouter>
        <TamagotchiPlayground initialCompanionId="luna" />
      </BrowserRouter>
    );
    expect(screen.getByText('HUNGER')).toBeInTheDocument();
    expect(screen.getByText('HAPPINESS')).toBeInTheDocument();
    expect(screen.getAllByText(/ENERGY/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Feed')).toBeInTheDocument();
    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(screen.getByText('Care')).toBeInTheDocument();
    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(screen.getByText('Pizza Slice')).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders SceneStudio with stage controls without emojis', () => {
    const { container } = render(<SceneStudio />);
    expect(screen.getByText(/SCENE BUILDER & STAGE STUDIO/i)).toBeInTheDocument();
    expect(screen.getByText(/Detroit Skyline/i)).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders the ArcadePortfolio hub with two halls and zero emojis', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/arcade']}>
        <ArcadePortfolio />
      </MemoryRouter>
    );
    const halls = screen.getByRole('list', { name: 'Halls' });
    expect(within(halls).getByRole('link', { name: 'Play Enter' })).toHaveAttribute('href', '/arcade/play');
    expect(within(halls).getByRole('link', { name: 'Create Enter' })).toHaveAttribute('href', '/arcade/create');
    expect(within(halls).queryByRole('link', { name: 'Stories Enter' })).toBeNull();
    const crumbs = screen.getByRole('navigation', { name: 'Arcade breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Arcade' })).toHaveAttribute('aria-current', 'page');
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });

  it('renders each hall with its experiences as entry links', () => {
    const expected: Record<string, string[]> = {
      play: ['Team Brawler', 'Tamagotchi'],
      create: ['Character Lab', 'Heroes Gallery', 'Stage Studio'],
    };
    for (const [hall, titles] of Object.entries(expected)) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/arcade/${hall}`]}>
          <ArcadePortfolio />
        </MemoryRouter>
      );
      const list = screen.getByRole('list', { name: /experiences$/ });
      const links = within(list).getAllByRole('link');
      expect(links).toHaveLength(titles.length);
      titles.forEach((title, idx) => expect(links[idx].textContent).toContain(title));
      unmount();
    }
  });

  it('deep links open an experience with a breadcrumb and a back link', () => {
    render(
      <MemoryRouter initialEntries={['/arcade/play/tamagotchi']}>
        <ArcadePortfolio />
      </MemoryRouter>
    );
    const crumbs = screen.getByRole('navigation', { name: 'Arcade breadcrumb' });
    expect(within(crumbs).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Arcade',
      'Play',
      'Tamagotchi',
    ]);
    expect(within(crumbs).getByRole('link', { name: 'Tamagotchi' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Back to Play/i })).toHaveAttribute('href', '/arcade/play');
    expect(screen.getByText('HUNGER')).toBeInTheDocument();
  });

  it('resolves arcade paths and redirects unknown ones to the closest parent', () => {
    expect(resolveArcadePath('/arcade').location.level).toBe('hub');
    expect(resolveArcadePath('/arcade/create/').location.level).toBe('hall');
    expect(resolveArcadePath('/arcade/create/heroes').location.level).toBe('experience');
    expect(resolveArcadePath('/arcade/stories/heroes').redirect).toBe('/arcade/create/heroes');
    expect(resolveArcadePath('/arcade/stories/theater').redirect).toBe('/arcade');
    expect(resolveArcadePath('/arcade/nope').redirect).toBe('/arcade');
    expect(resolveArcadePath('/arcade/play/nope').redirect).toBe('/arcade/play');
    expect(resolveArcadePath('/arcade/play/brawler/extra').redirect).toBe('/arcade/play/brawler');
  });

  it('renders ArcadeTeamBrawler with squad slots and roster without emojis', async () => {
    const { ArcadeTeamBrawler } = await import('../src/components/arcade/brawler/ArcadeTeamBrawler');
    const { container } = render(<ArcadeTeamBrawler />);
    expect(screen.getByText(/SIMPSONS ARCADE TEAM BRAWLER/i)).toBeInTheDocument();
    expect(screen.getByText(/AUTO DRAFT SQUAD/i)).toBeInTheDocument();
    expect(screen.getByText(/START BRAWL/i)).toBeInTheDocument();
    expect(EMOJI_REGEX.test(container.innerHTML)).toBe(false);
  });
});
