import ReactDOM from 'react-dom';
import './index.css';
import { App } from './App';
import * as ReactGA from 'react-ga';

// Fix console text color in dark mode
if (window.matchMedia('(prefers-color-scheme: dark)').matches === true){
	console.log(
		'%c%s',
		'color: red; font-family: system-ui; font-size: 2rem; font-weight: bold',
		'Welcome to my portfolio!'
	);

	console.log(
		'%cYou\'re pretty advanced to have come here. Perhaps snooping for some cheeky errors 😝 or looking for some %cquality %ccode to copy! In any regard, feel free to reach out with any feedback or if you\'d like to chat about working together.',
		'color: white; font-family: system-ui; font-size: 1rem;',
		'font-weight: bold; text-transform: uppercase; font-size: 2rem;',
		'color: white; font-family: system-ui; font-size: 1rem;'
	);
} else {
	console.log(
		'%c%s',
		'color: blue; font-family: system-ui; font-size: 2rem; -webkit-text-stroke: 1px black; font-weight: bold',
		'Welcome to my portfolio!'
	);

	console.log(
		'%cYou\'re pretty advanced to have come here. Perhaps snooping for some cheeky errors 😝 or looking for some %cquality %ccode to copy! In any regard, feel free to reach out with any feedback or if you\'d like to chat about working together.',
		'color: black; font-family: system-ui; font-size: 1rem;',
		'font-weight: bold; text-transform: uppercase; font-size: 2rem;',
		'color: black; font-family: system-ui; font-size: 1rem;'
	);
}

const trackingId = 'UA-147974881-1';
ReactGA.initialize(trackingId);

ReactDOM.render(
	<App />,
	document.getElementById('root')
);
