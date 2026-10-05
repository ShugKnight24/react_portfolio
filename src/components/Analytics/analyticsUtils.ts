import ReactGA from 'react-ga4';

type UaEventOptions = Exclude<Parameters<typeof ReactGA.event>[0], string>;

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
