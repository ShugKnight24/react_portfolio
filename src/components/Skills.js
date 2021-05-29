import TechIcon from './TechIcon';
import { Grid, Cell, ProgressBar } from 'react-mdl';

export function Skills({ iconName, iconURL, index, progress, skillType }){
	//  different arrays for different 
	if (skillType  === ''){
		let headerTitle = '';
	}
	return(
		<Grid>
			<Cell col={ 12 }>
				<div className="progress-container">
				{/* <TechIcon
					key={ `${ iconName }-${ index }` }
					iconName={ iconName }
					iconURL={ iconURL }
				/> */}
				<span className={`bold-text ${ progress !== null && 'skill-name-centered'}`}>{ iconName }</span>
					{
						progress !== null &&
						<ProgressBar className="skill-progress" progress={ progress }/>
					}
				</div>
			</Cell>
		</Grid>
	);
}
