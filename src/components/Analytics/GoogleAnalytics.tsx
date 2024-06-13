import { FC, useEffect } from 'react';
import { initializeGA } from './analyticsUtils';

export const GoogleAnalytics: FC = () => {
  useEffect(() => {
    initializeGA();
  }, []);
  return null;
};
