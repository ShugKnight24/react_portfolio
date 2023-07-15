import { FC } from 'react';

export const Footer: FC = () => {
	const currentYear = new Date().getFullYear();

	return(
		<div className="footer">
			<p>Built by Shugmi Shumunov &copy; { currentYear }. All Rights Reserved</p>
		</div>
	)
}
