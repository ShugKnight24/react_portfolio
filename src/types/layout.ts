import { ReactNode } from 'react';

export interface ContentInterface {
  children: ReactNode;
}

export interface DrawerInterface {
  children: ReactNode;
  isVisible: boolean;
  title: string;
}

export interface HeaderInterface {
  children: ReactNode;
  title: string;
}

export interface LayoutInterface {
  children: ReactNode;
}

export interface NavProps {
  toggleDrawer?: () => void;
}
