import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const GTB: FC = () => {
	return (
		<div className="projects-grid">
			<ProjectCard
				titleAriaLabel="Image of Optima Batteries website homepage"
				titleExtraClass="project-cards-title optima"
				titleRole="img"
				title="Optima Batteries"
				description={[
					"Website built for Optima Batteries using Concrete5 CMS. Updated content, built features, and wrote styles as needed."
				]}
				buttonLinks={["https://www.optimabatteries.com/en-us"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of Varta Europe website homepage"
				titleExtraClass="project-cards-title varta"
				titleRole="img"
				title="Varta Europe"
				description={[
					"Website built for Varta Europe using Concrete5 CMS. Updated content, built features, and wrote styles as needed."
				]}
				buttonLinks={["https://www.varta-automotive.com/en-gb"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of Varta China website homepage"
				titleExtraClass="project-cards-title varta-china"
				titleRole="img"
				title="Varta China"
				description={[
					"Website built for Varta China using Concrete5 CMS. Needed their own site due to Chinese regulations. Updated content, built features, and wrote styles as needed."
				]}
				buttonLinks={["https://www.varta-automotive.cn/zh-cn"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of Delkor Austrailia website homepage"
				titleExtraClass="project-cards-title delkor"
				titleRole="img"
				title="Delkor Austrailia"
				description={[
					"Website built for Delkor Austrailia using Concrete5 CMS. Updated content, built features, and wrote styles as needed."
				]}
				buttonLinks={["https://www.delkor.com.au/en-au"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of Delkor Korea website homepage"
				titleExtraClass="project-cards-title delkor-korea"
				titleRole="img"
				title="Delkor Korea"
				description={[
					"Website built for Delkor Korea using Concrete5 CMS. Updated content, built features, and wrote styles as needed."
				]}
				buttonLinks={["https://www.delkor.kr/ko-kr"]}
				buttonText={["Live Site"]}
			/>
		</div>
	);
}
