import ReactGA from 'react-ga4';

const gaTrackingId = 'G-G4LH4VLSV3';

export const initializeGA = () => {
  ReactGA.initialize(gaTrackingId);
};

export const trackPageEvent = (category: string, action: string, label: string) => {
  ReactGA.event({ category, action, label });
};
