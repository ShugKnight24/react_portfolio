import { FC, KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Photo, PhotoCategory, photoCategories, photos, photosBy } from '../../data/photos';
import { Gallery } from '../Gallery/Gallery';
import { PageHero } from '../Layout/PageHero';

type Filter = PhotoCategory | 'all';

const tabs: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...photoCategories];

// Featured frames lead each tab; the rest keep their data order
const featuredFirst = (list: Photo[]) => [
  ...list.filter((p) => p.featured),
  ...list.filter((p) => !p.featured),
];

const lunaFeature = photos.find((p) => p.id === 'luna-sunset-trot');

export const PhotoGal: FC = () => {
  const [active, setActive] = useState<Filter>('all');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const counts = useMemo(
    () =>
      Object.fromEntries(tabs.map((t) => [t.id, photosBy(t.id).length])) as Record<Filter, number>,
    []
  );
  const clipCount = useMemo(() => photos.filter((p) => p.kind === 'video').length, []);

  const visible = useMemo(() => featuredFirst(photosBy(active)), [active]);
  const activeLabel = tabs.find((t) => t.id === active)?.label ?? 'All';

  const selectTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      selectTab(moves[e.key]);
    }
  };

  const showLuna = () => {
    const index = tabs.findIndex((t) => t.id === 'luna');
    selectTab(index);
    tabRefs.current[index]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="mc-page mc-photos">
      <PageHero
        id="photos-title"
        title="Camera"
        outline="Roll"
        meta={['Detroit, MI', `${photos.length} frames`, `${clipCount} clips`]}
        lede="Luna, trips, a few people I met along the way and the everyday stuff in between. None of it is professional. Tap a frame to see it full size."
        stats={[
          { value: counts.all, label: 'Frames' },
          { value: counts.luna, label: 'Luna' },
          { value: counts.travel, label: 'Travel' },
          { value: counts.friends + counts.me, label: 'People' },
        ]}
      />

      <div className="mc-shell">
        <div className="mc-toolbar">
          <div className="mc-tabs" role="tablist" aria-label="Photo galleries">
            {tabs.map((tab, index) => {
              const selected = active === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  id={`photos-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="photos-panel"
                  tabIndex={selected ? 0 : -1}
                  className={`mc-tab${selected ? ' is-active' : ''}`}
                  onClick={() => setActive(tab.id)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                >
                  {tab.label}
                  <span className="mc-tab-count">{counts[tab.id]}</span>
                </button>
              );
            })}
          </div>
          <p className="mc-toolbar-note" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'frame' : 'frames'}
          </p>
        </div>

        <div id="photos-panel" role="tabpanel" aria-labelledby={`photos-tab-${active}`}>
          <Gallery photos={visible} label={activeLabel === 'All' ? 'Photo' : activeLabel} />
        </div>

        {lunaFeature && (
          <section className="mc-feature" aria-labelledby="luna-title">
            <figure className="mc-still mc-still--tilt-left">
              <img
                src={lunaFeature.thumb}
                width={lunaFeature.width}
                height={lunaFeature.height}
                alt={lunaFeature.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{lunaFeature.caption}</figcaption>
            </figure>
            <div className="mc-feature-copy">
              <p className="mc-eyebrow">{counts.luna} frames</p>
              <h2 id="luna-title" className="mc-display-sm">
                Luna, <span className="mc-outline">always</span>
              </h2>
              <p>
                Luna was my dog, my hiking partner and the best reset after a long day of code. Big
                ears, bigger heart. Most of this roll is hers.
              </p>
              <button
                type="button"
                className="mc-btn"
                style={{ border: 0, cursor: 'pointer' }}
                onClick={showLuna}
              >
                See the Luna gallery
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
