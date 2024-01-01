import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const Nexient: FC = () => {
  return (
    <div className="projects-grid">
      <ProjectCard
        title="Levi's Mobile App"
        titleAriaLabel="Image of Levi's Mobile App Home Screen"
        titleExtraClass="levis"
        titleRole="img"
        description={[
          'I helped Levi\'s customers find the perfect pair of jeans 😉',
          'Built API driven onboarding flow as user enters the app',
          'Upgraded the return history flow',
          'Integrated additional payment methods into the app'
        ]}
        buttonLinks={[
          'https://apps.apple.com/us/app/levis-shop-denim-more/id1481624020',
          'https://play.google.com/store/apps/details/Levi_s?id=com.levi.levis247'
        ]}
        buttonText={[
          'App Store',
          'Play Store'
        ]}
      />
      <ProjectCard
        title="Vectorform"
        titleAriaLabel="Image of Vectorform Website Homepage"
        titleExtraClass="vectorform"
        titleRole="img"
        description={[
          'Develop greenfield 3D configurator for a fashion accessory company'
        ]}
        buttonLinks={[
          'https://www.vectorform.com/'
        ]}
        buttonText={[
          'Company Site'
        ]}
      />
    </div>
  );
}
