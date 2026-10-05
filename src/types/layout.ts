import { ReactNode, Ref } from 'react';

export interface ContentInterface {
  children: ReactNode;
}

export interface DrawerInterface {
  children: ReactNode;
  id: string;
  isVisible: boolean;
  ref?: Ref<HTMLDivElement>;
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
  label?: string;
  toggleDrawer?: () => void;
}
