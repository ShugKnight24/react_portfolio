import ReactGA from 'react-ga4';
import { UaEventOptions } from 'react-ga4/types/ga4';

const gaTrackingId = 'G-G4LH4VLSV3';

export const initializeGA = () => {
  ReactGA.initialize(gaTrackingId);
};

export const trackPageEvent = (category: string, action: string, label: string, value?: number) => {
  const analyticsEvent: UaEventOptions = {
    category,
    action,
    label,
  };
  if (value) {
    analyticsEvent.value = value;
  }
  ReactGA.event(analyticsEvent);
};
