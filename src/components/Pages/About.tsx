import { FC } from 'react';
import { photosBy } from '../../data/photos';
import { aboutApproachText, aboutText } from '../../data/portfolioStrings';
import { DetroitSkylineScene } from '../DetroitSkyline/DetroitSkylineScene';
import { LunaVigil, VigilPhoto } from './LunaVigil';

const funFacts = [
  { label: 'Puzzle', value: "Can solve a Rubik's cube. Slowly" },
  { label: 'Gym', value: 'Lifts heavy things, puts them back' },
  { label: 'Fuel', value: "Coffee, more than I'll admit" },
  { label: 'Reading', value: 'Always mid book, usually a re-read' },
  { label: 'Dog', value: 'Luna, forever my good girl' },
];

const interests = ['Fitness', 'Travel', 'Books', 'Music', 'Photography', 'Games', 'Startups'];

// Featured Luna shots first (minus the one the Photos page leads with), then a few favorites.
// Order matters: the vigil collage sizes its tiles by position.
const vigilPhotoIds = [
  'luna-porch-smile',
  'luna-snow-glance',
  'luna-window-watch',
  'luna-snow-stop',
  'luna-sleepy-face',
  'luna-golden-wall',
];

const lunaPhotos: VigilPhoto[] = vigilPhotoIds.flatMap((id) => {
  const photo = photosBy('luna').find((p) => p.id === id);
  // The collage tiles are small, so the 900px thumbs are plenty
  return photo ? [{ src: photo.thumb, alt: photo.alt, caption: photo.caption }] : [];
});

export const About: FC = () => (
  <div className="mc-about-body">
    <section className="mc-section" aria-labelledby="about-story-title">
      <header className="mc-section-head">
        <p className="mc-eyebrow">About</p>
        <h2 id="about-story-title" className="mc-display-sm">
          The longer <span className="mc-outline">version</span>
        </h2>
      </header>

      <div className="mc-split">
        <div className="mc-prose">
          {aboutText.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <h3 className="mc-subhead">Still figuring it out</h3>
          {aboutApproachText.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        <aside className="mc-sidecar" aria-label="Quick facts">
          <p className="mc-eyebrow">A few things</p>
          <dl className="mc-facts">
            {funFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mc-eyebrow">Off the clock</p>
          <p className="mc-inline-list">{interests.join(' / ')}</p>
        </aside>
      </div>
    </section>

    <div className="mc-skyline">
      <DetroitSkylineScene />
    </div>

    <LunaVigil photos={lunaPhotos} />
  </div>
);
