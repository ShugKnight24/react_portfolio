import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const ShumunovSolutions: FC = () => {
	return (
		<div className="projects-grid">
			<ProjectCard
				titleAriaLabel="Image of RegenMedGlobal website homepage"
				titleExtraClass="project-cards-title regenmedglobal"
				titleRole="img"
				title="RegenMedGlboal"
				description={[
					"Improve site UI, performance, and SEO",
					"Update site functionality"
				]}
				buttonLinks={["https://regenmedglobal.com/"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of WhosOut App Loading Screen & Additional Screens"
				titleExtraClass="project-cards-title whosout"
				titleRole="img"
				title="WhosOut"
				description={[
					"Helped upgrade app for launch",
					"Improved app architecture, functionality, and performance"
				]}
				buttonLinks={["https://apps.apple.com/us/app/whosout/id6444222005"]}
				buttonText={["App Store"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of building directory website homepage"
				titleExtraClass="project-cards-title directory"
				titleRole="img"
				title="Buidling Directory"
				description={[
					"Built building directory for a local commercial office building",
					"Built with React, TypeScript, Next.js, and Contentful CMS"
				]}
				buttonLinks={["http://www.shumunovsolutions.com/dir"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of Shumunov Solutions website homepage"
				titleExtraClass="project-cards-title shumunov-solutions"
				titleRole="img"
				title="Shumunov Solutions"
				description={["Providing technology solutions to South East Michigan businesses"]}
				buttonLinks={["http://www.shumunovsolutions.com"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of JK Unlimited Services website homepage"
				titleExtraClass="project-cards-title jk-unlimited-services"
				titleRole="img"
				title="JK Unlimited Services"
				description={["Website for West Bloomfield, MI general contractor"]}
				buttonLinks={["http://www.jkunlimitedservices.com/"]}
				buttonText={["Live Site"]}
			/>
			{/* TODO: Host site somewhere to display */}
			<ProjectCard
				titleAriaLabel="Image of Paper Goods Warehouse website homepage"
				titleExtraClass="project-cards-title paper-goods-warehouse"
				titleRole="img"
				title="Paper Goods Warehouse"
				description={["Website for Oak Park, MI store. Sadly, they have since closed"]}
			/>
		</div>
	);
}
