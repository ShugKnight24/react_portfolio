import { FC } from 'react';

interface ProgressBarInterface {
	progress?: number;
}

export const ProgressBar: FC<ProgressBarInterface> = ({ progress }) => {
	return (
		<div className="progress-bar-container skill-progress">
			<div
				className="progress-bar bar"
				style={{ width: `${ progress }%` }}
			></div>
			<div className="buffer-bar bar"></div>
			<div className="aux-bar bar"></div>
			<p>{ progress }%</p>
		</div>
	);
}