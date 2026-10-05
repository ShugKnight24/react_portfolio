import { KeyboardEvent } from 'react';

// Arrow/Home/End navigation for role="tablist": moves focus and activates the tab.
// Pair with roving tabIndex (0 on the selected tab, -1 on the rest).
export const onTabListKeyDown = (e: KeyboardEvent<HTMLElement>) => {
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')];
  const current = tabs.indexOf(document.activeElement as HTMLElement);
  if (current === -1) return;

  const next = {
    ArrowRight: (current + 1) % tabs.length,
    ArrowDown: (current + 1) % tabs.length,
    ArrowLeft: (current - 1 + tabs.length) % tabs.length,
    ArrowUp: (current - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }[e.key];
  if (next === undefined) return;

  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
};
