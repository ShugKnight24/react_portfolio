export type PhotoCategory = 'me' | 'luna' | 'travel' | 'friends' | 'life';

export type Photo = {
  id: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
  alt: string;
  category: PhotoCategory;
  caption?: string;
  date?: string;
  featured?: boolean;
  kind?: 'image' | 'video';
  poster?: string;
};

export const photoCategories: { id: PhotoCategory; label: string }[] = [
  { id: 'me', label: 'Me' },
  { id: 'luna', label: 'Luna' },
  { id: 'travel', label: 'Travel' },
  // Folks I've met out and about; the id stays 'friends' because it is the image folder name
  { id: 'friends', label: 'Met along the way' },
  { id: 'life', label: 'Life' },
];

const base = './img/photos';

const img = (
  category: PhotoCategory,
  id: string,
  width: number,
  height: number,
  alt: string,
  extra: Pick<Photo, 'caption' | 'date' | 'featured'> = {}
): Photo => ({
  id,
  src: `${base}/${category}/${id}.jpg`,
  thumb: `${base}/${category}/${id}-thumb.jpg`,
  width,
  height,
  alt,
  category,
  kind: 'image',
  ...extra,
});

const video = (
  id: string,
  width: number,
  height: number,
  alt: string,
  extra: Pick<Photo, 'caption' | 'date' | 'featured'> = {}
): Photo => ({
  id,
  src: `${base}/video/${id}.mp4`,
  thumb: `${base}/video/${id}-poster.jpg`,
  poster: `${base}/video/${id}-poster.jpg`,
  width,
  height,
  alt,
  category: 'luna',
  kind: 'video',
  ...extra,
});

export const photos: Photo[] = [
  // travel
  img(
    'travel',
    'golden-gate-from-below',
    1500,
    2000,
    'The Golden Gate Bridge seen from the water below, a kite surfer riding the chop',
    { caption: 'Under the Golden Gate', featured: true }
  ),
  img(
    'travel',
    'golden-gate-boat-wake',
    2000,
    1500,
    'A flag flying off the back of a boat, its wake trailing toward the Golden Gate Bridge',
    { caption: 'Leaving a wake in the bay' }
  ),
  img(
    'travel',
    'bay-afternoon-glare',
    2000,
    1500,
    'Bright sun over choppy water with the Golden Gate Bridge on the horizon',
    { caption: 'Bay afternoon, full sun' }
  ),
  img(
    'travel',
    'open-water-sunset',
    1600,
    1200,
    'The sun setting low over wide open water under streaky clouds',
    { caption: 'Open water at sunset' }
  ),
  img(
    'travel',
    'moonrise-over-water',
    1200,
    1600,
    'A full moon rising over dark water, seen from a balcony',
    { caption: 'Moonrise from the balcony' }
  ),
  img(
    'travel',
    'big-waterfall',
    1500,
    2000,
    'A tall waterfall pouring into a misty gorge lined with evergreens',
    { caption: 'Loud, cold and worth the drive', featured: true }
  ),
  img(
    'travel',
    'tall-waterfall',
    1500,
    2000,
    'A long thin waterfall falling down a mossy cliff face',
    { caption: 'A long way down' }
  ),
  img(
    'travel',
    'river-gorge-pines',
    2000,
    1500,
    'Tall pines framing a wide river gorge and distant cliffs',
    { caption: 'Pines over the gorge' }
  ),
  img(
    'travel',
    'river-gorge-overlook',
    2000,
    1500,
    'An overlook above a river gorge with a lake, a highway and cliffs beyond',
    { caption: 'The overlook', featured: true }
  ),
  img(
    'travel',
    'mountain-over-the-port',
    1500,
    2000,
    'A snow capped mountain rising behind shipping cranes and a bridge',
    { caption: 'The mountain shows up behind everything' }
  ),
  img(
    'travel',
    'yellow-rolls-royce',
    1500,
    2000,
    'A bright yellow Rolls-Royce parked by a red curb on a palm lined shopping street',
    { caption: 'Matching the parking meter' }
  ),
  img(
    'travel',
    'lower-manhattan-from-water',
    1500,
    2000,
    'The Lower Manhattan skyline and One World Trade Center seen from the river',
    { caption: 'Manhattan from the water' }
  ),
  img(
    'travel',
    'chrysler-building-from-above',
    1500,
    2000,
    'Looking down on the Chrysler Building and Midtown Manhattan from high above',
    { caption: 'The Chrysler from way up', date: '2022-03', featured: true }
  ),
  img(
    'travel',
    'manhattan-sunset',
    1500,
    2000,
    'The sun setting over Manhattan rooftops from an observation deck',
    { caption: 'Sunset over the city', date: '2022-03' }
  ),
  img(
    'travel',
    'manhattan-at-night',
    1500,
    2000,
    'Midtown Manhattan lit up at dusk with the Chrysler Building glowing in the middle',
    { caption: 'Lights on', date: '2022-03' }
  ),
  img(
    'travel',
    'one-world-trade',
    1500,
    2000,
    'One World Trade Center rising into a clear blue sky',
    { caption: 'Looking straight up', date: '2022-07' }
  ),
  img(
    'travel',
    'beach-from-balcony',
    2000,
    1500,
    'A turquoise ocean and sandy beach seen between two high rise towers',
    { caption: 'Room with a view', date: '2022-06' }
  ),
  img(
    'travel',
    'beach-day',
    2000,
    1500,
    'A sandy beach with tire tracks, calm blue water and scattered clouds',
    { caption: 'Beach day', date: '2023-03' }
  ),
  img(
    'travel',
    'dream-mural',
    1500,
    2000,
    'A colorful mural with a DREAM street sign above a large boulder',
    { caption: 'Keep dreaming', date: '2023-03' }
  ),
  img(
    'travel',
    'jaguar-mural',
    2000,
    1500,
    'A street mural of a jaguar leaping through a jungle waterfall',
    { caption: 'Street art, big cat', date: '2023-03' }
  ),
  img(
    'travel',
    'fearless-gallery-wall',
    2000,
    1500,
    'A gallery wall with a large collage spelling FEAR LESS above a velvet couch',
    { caption: 'Good advice on a wall', date: '2023-03' }
  ),
  img(
    'travel',
    'cathedral-of-learning',
    1500,
    2000,
    'A gothic university tower rising above trees and a busy street',
    { caption: 'A tower full of classrooms', date: '2023-07' }
  ),
  img(
    'travel',
    'cathedral-looking-up',
    1500,
    2000,
    'Looking up the gothic stone face of a tall university tower',
    { caption: 'Looking up', date: '2023-07', featured: true }
  ),
  img(
    'travel',
    'gothic-fountain',
    1500,
    2000,
    'An ornate stone fountain set into a gothic building, framed by flowers',
    { caption: 'Hidden fountain', date: '2023-07' }
  ),
  img(
    'travel',
    'space-needle-from-the-sound',
    1200,
    1600,
    'The Space Needle rising over waterfront apartments across Puget Sound, kayakers on the water and mountains behind',
    { caption: 'The Needle from the water', date: '2022-08' }
  ),
  img(
    'travel',
    'puget-sound-shoreline',
    2000,
    1500,
    'A pebbly beach curving along calm blue Puget Sound under wispy clouds',
    { caption: 'Puget Sound, being calm about it', date: '2022-08' }
  ),
  img(
    'travel',
    'snoqualmie-falls-from-below',
    2000,
    1500,
    'Snoqualmie Falls pouring off a rocky cliff into a misty pool, seen from the river bank below',
    { caption: 'Snoqualmie from the bottom', date: '2022-08' }
  ),
  img(
    'travel',
    'mount-rainier',
    2000,
    1500,
    'Mount Rainier covered in snow and glaciers above a valley of evergreens on a clear day',
    { caption: 'Rainier, no clouds, somehow', date: '2022-08', featured: true }
  ),
  img(
    'travel',
    'christine-falls-bridge',
    1500,
    2000,
    'A waterfall dropping through a narrow mossy gorge under an old stone arch bridge',
    { caption: 'A bridge built just for the photo', date: '2022-08' }
  ),
  img(
    'travel',
    'multnomah-falls',
    1500,
    2000,
    'Both tiers of Multnomah Falls with the stone footbridge crossing between them',
    { caption: 'Multnomah, both floors', date: '2022-08', featured: true }
  ),
  img(
    'travel',
    'japanese-garden-koi',
    2000,
    1500,
    'Orange and white koi gliding through a still pond edged with tall grass in a Japanese garden',
    { caption: 'Koi with zero deadlines', date: '2022-08' }
  ),
  img(
    'travel',
    'mount-shasta-road-trip',
    1500,
    2000,
    'A highway running straight toward snow capped Mount Shasta, seen through the windshield',
    { caption: 'Shasta, dead ahead', date: '2022-08' }
  ),
  img(
    'travel',
    'golden-gate-headlands',
    2000,
    1500,
    'The Golden Gate Bridge stretching to the Marin Headlands across choppy blue water',
    { caption: 'The whole bridge, for once', date: '2022-08' }
  ),
  img(
    'travel',
    'miami-skyline-at-night',
    2000,
    1500,
    'The downtown Miami skyline lit up at night across Biscayne Bay, a glowing Ferris wheel at the waterline',
    { caption: 'Miami after dark', date: '2022-06' }
  ),
  img(
    'travel',
    'statue-of-liberty',
    1500,
    2000,
    'The Statue of Liberty in silhouette against a bright sun, the harbor sparkling in front',
    { caption: 'Lady Liberty, backlit', date: '2022-07' }
  ),
  // me
  img(
    'me',
    'shug-above-manhattan',
    1500,
    2000,
    'Shug in a blazer on an observation deck, the Empire State Building behind him',
    { caption: 'On top of the city', date: '2022-03', featured: true }
  ),
  img(
    'me',
    'shug-arched-window',
    1500,
    2000,
    'Shug standing in a tall arched window with the sea behind him',
    { caption: 'Framed by the sea', date: '2023-03', featured: true }
  ),
  img(
    'me',
    'shug-pineapple-festival',
    1500,
    2000,
    'Shug grinning at a street festival holding a pineapple drink',
    { caption: 'Pineapple in hand', date: '2023-03', featured: true }
  ),
  img(
    'me',
    'shug-luna-car-smile',
    1500,
    1997,
    'Shug and Luna both grinning in the car, her tongue out, his beard in frame',
    { caption: 'Co-pilot', featured: true }
  ),
  img('me', 'shug-sunny-portrait', 1500, 2000, 'Shug smiling in the sun in front of green trees', {
    caption: 'Sunny day',
    date: '2023-03',
  }),
  img(
    'me',
    'shug-lake',
    2000,
    1125,
    'Shug sitting at the end of a dock on a sparkling lake, pines and birch framing the view',
    { caption: 'End of the dock, the old hero shot', date: '2019-09', featured: true }
  ),
  img(
    'me',
    'shug-brick-wall-point',
    1333,
    2000,
    'Shug sitting against a brick wall pointing at the camera',
    { caption: 'Yes, you', featured: true }
  ),
  img(
    'me',
    'shug-brick-wall-thinking',
    1333,
    2000,
    'Shug sitting against a brick wall, chin in his hands',
    { caption: 'Thinking about it' }
  ),
  img(
    'me',
    'blockbuster-sign',
    2000,
    1500,
    'Shug in the shadows next to a glowing Blockbuster sign',
    { caption: 'Be kind, rewind' }
  ),
  // met along the way
  img(
    'friends',
    'graffiti-alley-selfie',
    1500,
    2000,
    'Shug taking a selfie in a graffiti covered alley',
    { caption: 'Color everywhere', date: '2023-03', featured: true }
  ),
  img(
    'friends',
    'author-meetup',
    2000,
    1921,
    'Shug posing with a well known author at a speaking event',
    { caption: 'A good night of big ideas', featured: true }
  ),
  img('friends', 'gym-meetup', 1500, 2000, 'Shug and a fitness coach flexing in a gym lobby', {
    caption: 'Gym day, met a legend',
    featured: true,
  }),
  // luna
  img(
    'luna',
    'luna-window-watch',
    1500,
    2000,
    'Luna standing at a big window, watching the yard outside',
    { caption: 'On patrol', date: '2022-07', featured: true }
  ),
  img(
    'luna',
    'luna-sunset-trot',
    1500,
    2000,
    'Luna trotting across the grass toward the camera at sunset',
    { caption: 'Golden hour Luna', date: '2023-04', featured: true }
  ),
  img(
    'luna',
    'luna-sleepy-face',
    1500,
    2000,
    'Luna resting her chin on the edge of the bed, eyes half closed',
    { caption: 'Too comfy to move', date: '2022-10', featured: true }
  ),
  img(
    'luna',
    'luna-snow-glance',
    2000,
    1967,
    'Luna standing in deep snow looking back over her shoulder',
    { caption: 'Majestic in the snow', featured: true }
  ),
  img(
    'luna',
    'luna-good-girl',
    1333,
    2000,
    'Luna sitting and looking up at the camera with her big ears out',
    { caption: 'The best girl' }
  ),
  img('luna', 'luna-porch-smile', 1500, 2000, 'Luna on the porch, mouth open in a big happy grin', {
    caption: 'Ready for the walk',
    date: '2023-02',
  }),
  img(
    'luna',
    'luna-golden-wall',
    1500,
    2000,
    'Luna standing in dry grass in front of a stone wall, lit by the evening sun',
    { caption: 'Evening light', date: '2023-03' }
  ),
  img(
    'luna',
    'luna-bright-snow',
    2000,
    1500,
    'Luna standing in a snowy field with the low sun behind her',
    { caption: 'Bright winter walk', date: '2023-03' }
  ),
  img('luna', 'luna-snow-stop', 2000, 1500, 'Luna pausing on a snowy path, looking back', {
    caption: 'Waiting up for me',
    date: '2023-01',
  }),
  img('luna', 'luna-leaf-pile', 1500, 2000, 'Luna half buried in a big pile of autumn leaves', {
    caption: 'Leaf pile expert',
    date: '2022-11',
  }),
  img('luna', 'luna-on-the-rug', 1500, 2000, 'Luna lying on a red patterned rug, looking up', {
    caption: 'Her rug',
    date: '2022-12',
  }),
  img('luna', 'luna-dog-bed', 1500, 2000, 'Luna stretched out on her dog bed next to a chew toy', {
    caption: 'Off duty',
    date: '2022-10',
  }),
  img(
    'luna',
    'luna-flash-eyes',
    1500,
    2000,
    'Luna sitting and staring into the camera, eyes glowing from the flash',
    { caption: 'Caught by the flash', date: '2022-03' }
  ),
  img('luna', 'luna-bed-nap', 1500, 2000, 'Luna curled up asleep on the bed', {
    caption: 'Nap time',
    date: '2021-11',
  }),
  img('luna', 'luna-snow-jog', 1616, 1080, 'Luna jogging down a snowy trail', {
    caption: 'The Luna jog',
  }),
  img('luna', 'luna-snow-trail', 1616, 1080, 'Luna walking along a snowy park path', {
    caption: 'Fresh tracks',
  }),
  img(
    'luna',
    'luna-backyard-chase',
    2000,
    1500,
    'Luna racing a black dog across a green backyard',
    { caption: 'The chase', date: '2023-04' }
  ),
  img('luna', 'luna-park-play', 2000, 1500, 'Luna and a black dog playing in a sunny park', {
    caption: 'Playdate',
    date: '2023-02',
  }),
  img(
    'luna',
    'luna-lawn-lounge',
    1500,
    2000,
    'Luna lounging on a big green lawn with a black dog nearby',
    { caption: 'Lawn day', date: '2022-05' }
  ),
  img(
    'luna',
    'luna-snow-wrestle',
    1500,
    2000,
    'Luna and a black dog wrestling in the snow by a brick wall',
    { caption: 'Snow wrestling' }
  ),
  img('luna', 'luna-snow-tumble', 1500, 2000, 'Luna tumbling with a black dog in a snowy field', {
    caption: 'Snow day',
  }),
  img(
    'luna',
    'luna-tree-greeting',
    1500,
    2000,
    'Luna greeting a black dog under a big shade tree',
    { caption: 'Best buds' }
  ),
  img(
    'luna',
    'luna-car-copilot',
    1503,
    2000,
    'Luna in the back seat of the car, head tilted, next to Shug',
    {
      caption: 'Riding shotgun, technically',
    }
  ),
  img(
    'luna',
    'luna-yellow-raincoat',
    2000,
    1811,
    'Luna in a bright yellow raincoat by the front door, clearly not on board',
    { caption: 'Under protest' }
  ),
  img(
    'luna',
    'luna-balloon-field',
    1500,
    2000,
    'Luna sitting in a big field next to a white balloon at dusk',
    {
      caption: 'Birthday girl',
    }
  ),
  img(
    'luna',
    'luna-harness-lounge',
    2000,
    1500,
    'Luna lying on a sunny driveway in her pink harness, looking at the camera',
    { caption: 'Walk is over, apparently' }
  ),
  img(
    'luna',
    'luna-swing-set',
    1500,
    2000,
    'Luna standing under a playground swing set in her pink harness',
    {
      caption: 'Park inspector',
    }
  ),
  // life
  img(
    'life',
    'shashlik-grill',
    2000,
    1500,
    'Skewers of lamb smoking over hot coals on a backyard grill',
    { caption: 'Shashlik season', date: '2022-09', featured: true }
  ),
  img(
    'life',
    'shashlik-skewers',
    1500,
    2000,
    'A row of marinated meat skewers over a charcoal grill',
    { caption: 'Lined up and ready', date: '2022-09' }
  ),
  img(
    'life',
    'steak-dinner',
    2000,
    1500,
    'A steakhouse table with steak, lamb chops, asparagus and mac and cheese',
    { caption: 'Dinner, done right', date: '2022-03' }
  ),
  img(
    'life',
    'pressure-neon',
    2000,
    1500,
    'A neon sign reading THE PRESSURE IS GOOD FOR YOU above a dining table',
    { caption: 'Noted', featured: true }
  ),
  img(
    'life',
    'fox-theatre-marquee',
    1500,
    2000,
    'A crowd lined up under a lit up theater marquee downtown',
    { caption: 'Sold out night', date: '2022-05' }
  ),
  img('life', 'pink-roses', 2000, 1500, 'A big pink rose bush in full bloom by a front step', {
    caption: 'Stop and smell them',
    date: '2023-06',
    featured: true,
  }),
  img(
    'life',
    'purple-lamborghini',
    1500,
    2000,
    'A purple and green Lamborghini under parking lot lights at night',
    { caption: 'Joker spec', date: '2023-07', featured: true }
  ),
  img('life', 'porsche-pair', 1500, 2000, 'An orange and a yellow Porsche parked side by side', {
    caption: 'Porsche pair',
    date: '2022-08',
  }),
  img(
    'life',
    'matte-audi-r8',
    2000,
    1500,
    'A matte black Audi R8 with bronze wheels on a wet stone plaza',
    { caption: 'Matte and bronze', date: '2022-09' }
  ),
  img(
    'life',
    'matte-lamborghini',
    2000,
    1500,
    'A matte black Lamborghini parked on a rainy plaza',
    { caption: 'Rainy day exotic', date: '2022-09' }
  ),
  img('life', 'red-lotus', 2000, 1500, 'A small red Lotus sports car parked in an empty lot', {
    caption: 'Tiny and quick',
    date: '2022-12',
  }),
  img('life', 'teal-bmw-i8', 1500, 2000, 'A chrome teal BMW i8 parked at dusk', {
    caption: 'Chrome teal',
    date: '2023-02',
  }),
  img('life', 'husky-tommy', 2000, 1598, 'Tommy the husky tilting his head at the camera', {
    caption: 'Tommy, goofy as ever',
  }),
  img('life', 'husky-seray', 1737, 2000, 'Seray the husky standing in the snow', {
    caption: 'Seray in his element',
  }),
  img('life', 'husky-teddy', 2000, 987, 'Two huskies squaring off in the snow by a railing', {
    caption: 'Teddy has had enough',
  }),
  img('life', 'foggy-morning', 1616, 1080, 'A chilly winter morning over a snowy field', {
    caption: 'Foggy, chilly morning',
  }),
  img('life', 'sun-through-trees', 1616, 1080, 'The sun peeking through snowy trees', {
    caption: 'Sun through the trees',
  }),
  img('life', 'winter-sun-field', 1616, 1080, 'Low winter sun over a snowy field and treeline', {
    caption: 'Sun is shining',
  }),
  img('life', 'winter-sun-sky', 1616, 1080, 'A bright winter sun over dark trees and snow', {
    caption: 'Sunny and cold',
  }),
  img('life', 'lake-dock', 2000, 1125, 'A calm lake and dock framed by pines', {
    caption: 'Water makes me happy',
  }),
  // luna, video
  video(
    'luna-golden-run',
    980,
    1308,
    'Luna running toward the camera across dry grass in low golden light',
    { caption: 'Here she comes', date: '2023-03', featured: true }
  ),
  video('luna-play-bow', 980, 1308, 'Luna dropping into a play bow, tail up, ready to go', {
    caption: 'Play bow, tail up',
    date: '2023-03',
  }),
  video(
    'luna-field-sprint',
    720,
    1280,
    'Luna sprinting along a grassy field beside a long stone wall',
    { caption: 'Full speed', date: '2022-12' }
  ),
  video('luna-snow-zoomies', 1280, 960, 'Luna and a black dog wrestling in fresh snow', {
    caption: 'Snow zoomies',
    date: '2023-01',
  }),
  video('luna-snow-romp', 1280, 960, 'Luna chasing a black dog around a snowy yard', {
    caption: 'Round and round',
    date: '2023-02',
  }),
  video(
    'luna-snow-scuffle',
    980,
    1308,
    'Luna and a black dog squaring off for a play fight in the snow',
    { caption: 'Rematch', date: '2022-12' }
  ),
  // added from the October 2026 photo dump
  img(
    'luna',
    'luna-grass-roll',
    1500,
    2000,
    'Luna rolling on her back in freshly mowed grass, legs in the air',
    { caption: 'Back scratch, self serve' }
  ),
  img(
    'luna',
    'luna-toy-pile',
    2000,
    1500,
    'Luna asleep on the bed, surrounded by her stuffed toys',
    { caption: 'Hoarder' }
  ),
  img(
    'luna',
    'luna-lawn-toy',
    2000,
    1500,
    'Luna lying in the grass with a blue toy between her paws',
    { caption: 'Guarding the goods' }
  ),
  img(
    'luna',
    'luna-park-buddy',
    2000,
    1500,
    'Luna and a black dog sniffing each other on a sunny park path',
    { caption: 'Introductions' }
  ),
  img('luna', 'luna-hay-dig', 1500, 2000, 'Luna digging into a pile of cut grass on her leash', {
    caption: 'Landscaping',
  }),
  img('luna', 'luna-nose-boop', 2000, 1500, 'Luna and a black dog touching noses in the grass', {
    caption: 'Boop',
  }),
  img('luna', 'luna-pink-bed', 1500, 2000, 'Luna lounging on her big pink bed, paws crossed', {
    caption: 'Throne',
  }),
  img(
    'luna',
    'luna-court-fence',
    1500,
    2000,
    'Luna standing by a tennis court fence, looking back over her shoulder',
    { caption: 'Waiting on a doubles partner' }
  ),
  img(
    'luna',
    'luna-field-trot',
    1500,
    2000,
    'Luna trotting toward the camera across a big open field',
    { caption: 'On her way' }
  ),
  img(
    'luna',
    'luna-court-pole',
    1500,
    2000,
    'Luna on a tennis court next to the net post, mid wag',
    { caption: 'Line judge' }
  ),
  img('luna', 'luna-desk-bed', 2000, 1500, 'Luna on her bed under the desk next to a blue toy', {
    caption: 'Office dog',
  }),
  img(
    'luna',
    'luna-window-pose',
    1500,
    2000,
    'Luna sitting tall in a chair, nose up, catching the window light',
    { caption: 'Portrait mode' }
  ),
  img(
    'luna',
    'luna-floor-stare',
    1500,
    2000,
    'Luna lying on the carpet with her chin down, giving the camera a look',
    { caption: 'Not impressed' }
  ),
  img(
    'luna',
    'luna-ice-cream',
    1500,
    2000,
    'Luna licking an ice cream bar held out in front of her',
    { caption: 'Fair share' }
  ),
  img(
    'luna',
    'luna-spoon-lick',
    1500,
    2000,
    'Luna leaning in to lick a spoon, very close to the lens',
    { caption: 'Quality control' }
  ),
  img(
    'life',
    'grill-asparagus',
    1500,
    2000,
    'Asparagus and vegetables charring over an open grill at night',
    { caption: 'Vegetables, technically' }
  ),
  img('life', 'grill-steaks', 1500, 2000, 'Thick steaks searing on a grill over glowing coals', {
    caption: 'Cardio is a state of mind',
  }),
  img(
    'me',
    'shug-model-t',
    1500,
    2000,
    'Shug leaning on a black vintage Model T on a sunny street',
    { caption: 'Detroit, the early years' }
  ),
  img('friends', 'gym-flex-trio', 1500, 2000, 'Shug flexing with two bodybuilders in a gym', {
    caption: 'Outnumbered',
  }),
  img(
    'travel',
    'imagine-mosaic',
    1500,
    2000,
    'The black and white Imagine mosaic in Central Park',
    { caption: 'Imagine' }
  ),
  img(
    'me',
    'shug-fishing-catch',
    768,
    1024,
    'Shug on a boat holding up a fish he caught, open water behind him',
    { caption: 'Fish story, with proof' }
  ),
  img(
    'me',
    'shug-parrot',
    1500,
    2000,
    'Shug grinning with a green parrot perched on his shoulder',
    { caption: 'New co-pilot' }
  ),
];

/** Taken off the site but kept for reference; nothing renders these */
export const archivedPhotos: Photo[] = [
  img(
    'me',
    'shug-pirate-ship',
    1500,
    2000,
    'Shug sitting on a big green alligator statue in front of a pirate ship playground',
    { caption: 'Captain' }
  ),
  img(
    'travel',
    'shug-on-the-pier',
    1500,
    2000,
    'Shug leaning on a pier railing and grinning, with One World Trade and Lower Manhattan behind him',
    { caption: 'Tourist, confirmed', date: '2022-07' }
  ),
];

export const photosBy = (category: PhotoCategory | 'all'): Photo[] =>
  category === 'all' ? photos : photos.filter((photo) => photo.category === category);
