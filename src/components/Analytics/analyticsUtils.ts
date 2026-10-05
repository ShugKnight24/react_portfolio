import ReactGA from 'react-ga4';

type UaEventOptions = Exclude<Parameters<typeof ReactGA.event>[0], string>;

const gaTrackingId = 'G-G4LH4VLSV3';

// initialize() sends the first page_view; later route changes are counted by GA4's
// enhanced measurement (browser history events), so the app never sends page views itself.
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
