import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const PersonalProjects: FC = () => {
	return (
		<div className="projects-grid">
			{/* TODO: Update ones that need to be latest */}
			{/* TODO: Decide on other private projects to display */}
			<ProjectCard
				titleAriaLabel="Image of JavaScript Pomodoro clock built by Shugmi Shumunov"
				titleExtraClass="project-cards-title pomodoro"
				titleRole="img"
				title="Pomodoro Clock"
				description={["Built a Pomodoro clock in JavaScript that uses the pomodoro system and includes todo list functionality"]}
				buttonLinks={[
					"https://github.com/ShugKnight24/pomodoro",
					"https://shugknight24.github.io/pomodoro"
				]}
				buttonText={[
					"GitHub Repository",
					"Live Demo"
				]}
			/>
			<ProjectCard
				titleAriaLabel="Image of JavaScript Mappr project built by Shugmi Shumunov"
				titleExtraClass="project-cards-title mappr"
				titleRole="img"
				title="Mappr"
				description={["Map project built using OpenStreet map and Leaflet.js - Still in development"]}
				buttonLinks={[
					"https://github.com/ShugKnight24/Mappr",
					"https://shugknight24.github.io/Mappr"
				]}
				buttonText={["GitHub Repository", "Live Demo"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of JavaScript Quizzlr project built by Shugmi Shumunov"
				titleExtraClass="project-cards-title quizzlr"
				titleRole="img"
				title="Quizzlr"
				description={["Quiz project built using jQuery. Custom modal system - Still in development"]}
				buttonLinks={["https://shumunovsolutions.com/quiz"]}
				buttonText={["Live Demo"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of JavaScript Dooer project built by Shugmi Shumunov"
				titleExtraClass="project-cards-title dooer"
				titleRole="img"
				title="Dooer"
				description={["To-Do App built in React JS - Features a custom kanban board, basic to-do app, and pomodoro timer - Still in development"]}
				buttonLinks={["https://shumunovsolutions.com/dooer"]}
				buttonText={["Live Demo"]}
			/>
		</div>
	);
}
