export type ActiveTab = {
	activeTab: number;
}

export interface ProjectCardProps {
  titleAriaLabel: string;
  titleExtraClass: string;
  titleRole: string;
  title: string;
  description?: string[];
  buttonLinks?: string[];
  buttonText?: string[];
}
