import { FC } from 'react';
import { trackPageEvent } from './analyticsUtils';

interface AnalyticsCTA {
  CTALabel: string;
  CTAText: string;
  CTAValue?: number;
}

export const AnalyticsCTA: FC<AnalyticsCTA> = ({ CTALabel, CTAText, CTAValue }) => {
  return (
    <button
      onClick={() =>
        trackPageEvent('Analytics Playground', 'Test Action', CTALabel.toLowerCase(), CTAValue)
      }
    >
      {CTAText}
    </button>
  );
};
