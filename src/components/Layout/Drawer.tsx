import { FC } from 'react';
import { DrawerInterface } from '../../types/layout';

// Closed, the drawer is inert: its links leave the tab order and the accessibility tree
export const Drawer: FC<DrawerInterface> = ({ children, isVisible, title, id, ref }) => (
  <div
    ref={ref}
    id={id}
    className={`drawer ${isVisible ? 'active' : ''}`}
    role="dialog"
    aria-modal={isVisible}
    aria-labelledby={`${id}-title`}
    inert={!isVisible}
  >
    <span className="drawer-title" id={`${id}-title`}>
      {title}
    </span>
    {children}
  </div>
);
