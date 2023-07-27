import { useCallback, useState, useEffect } from 'react';

// TODO: Improve Display
const namesList = `
	Shugmi Shumunov
	<span class="bar">|</span>
	шумун шумунов
	<span class="bar">|</span>
	שמעון שומונוב
`;

// TODO: Add a way to change the speed of the typewriter
// TODO: Replicate backspace and delete characters as opposed to just adding them
export function TypeWriter (){
	const [names, setNames] = useState({ characters: '', charCounter: 0 });

	const { characters, charCounter } = names;

	const updateNames = useCallback(() => {
		const updatedNames = {
			...names,
			charCounter: charCounter + 1,
			characters: characters + namesList[charCounter]
		}
		setNames(updatedNames);
	}, [charCounter, characters, names]);
	
	const isNamesCompleted = namesList.length === characters.length;
	
	useEffect(() => {
		const timer = setInterval(() => !isNamesCompleted && updateNames(), 50)
		return () => clearInterval(timer);
	}, [isNamesCompleted, names, updateNames]);

	return (
		<span
			className="typewriter"
			dangerouslySetInnerHTML={{__html: characters}}
		></span>
	);
}
