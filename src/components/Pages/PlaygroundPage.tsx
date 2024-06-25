import { FC } from 'react';
import { AnalyticsCTA } from '../Analytics/AnalyticsCTA';

export const PlaygroundPage: FC = () => {
  return (
    <div className="playground">
      <h1>Playground Page</h1>
      <p>Playground content goes here...</p>
      <AnalyticsCTA CTALabel="purchase" CTAText="Test Purchase CTA" CTAValue={100} />
      <AnalyticsCTA
        CTALabel="mock_purchase_event"
        CTAText="Test Purchase Key Event"
        CTAValue={1500}
      />
      <AnalyticsCTA CTALabel="mock_subscription_event" CTAText="Test Subscribe CTA" />
    </div>
  );
};
