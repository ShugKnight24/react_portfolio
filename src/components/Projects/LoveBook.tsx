import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const LoveBook: FC = () => {
	return(
		<div className="projects-grid">
			<ProjectCard
				titleAriaLabel="Image of MyLoveBook website"
				titleExtraClass="project-cards-title mylovebook"
				titleRole="img"
				title="MyLoveBook"
				description={["Redirect site for LoveBookOnline.com and LoveCoups.com"]}
				buttonLinks={["https://www.mylovebook.com/"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of LoveCoups website homepage"
				titleExtraClass="project-cards-title lovecoups"
				titleRole="img"
				title="LoveCoups"
				description={["Build personalized coupon books for those you love"]}
				buttonLinks={["https://lovecoups.com"]}
				buttonText={["Live Site"]}
			/>
		</div>
	);
}
