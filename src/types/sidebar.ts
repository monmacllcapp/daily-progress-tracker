export interface NavItem {
  id: string;
  label: string;
  iconName: string;
  path: string;
}

export interface NavSection {
  id: string;
  title: string;
  isCollapsed: boolean;
  itemIds: string[];
}

export interface SidebarConfig {
  version: number;
  sections: NavSection[];
  items: NavItem[];
}

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
  version: 3,
  sections: [
    {
      id: 'section-command',
      title: 'Command Center',
      isCollapsed: false,
      itemIds: ['nav-dashboard'],
    },
    {
      id: 'section-flow',
      title: 'Flow',
      isCollapsed: false,
      itemIds: ['nav-morning', 'nav-planning', 'nav-calendar', 'nav-email'],
    },
    {
      id: 'section-main',
      title: 'Main',
      isCollapsed: false,
      itemIds: ['nav-tasks'],
    },
    {
      id: 'section-life',
      title: 'Life',
      isCollapsed: false,
      itemIds: ['nav-journal', 'nav-projects', 'nav-vision', 'nav-categories'],
    },
    {
      id: 'section-intelligence',
      title: 'Intelligence',
      isCollapsed: false,
      itemIds: ['nav-deals', 'nav-trading', 'nav-family', 'nav-finance', 'nav-dev-projects', 'nav-agents'],
    },
    {
      id: 'section-business',
      title: 'Business',
      isCollapsed: false,
      itemIds: ['nav-staffing', 'nav-finances'],
    },
  ],
  items: [
    { id: 'nav-dashboard', label: 'Command Center', iconName: 'Zap', path: '/' },
    { id: 'nav-tasks', label: 'Tasks', iconName: 'CheckSquare', path: '/tasks' },
    { id: 'nav-calendar', label: 'Calendar', iconName: 'Calendar', path: '/calendar' },
    { id: 'nav-email', label: 'Email', iconName: 'Mail', path: '/email' },
    { id: 'nav-journal', label: 'Journal', iconName: 'BookOpen', path: '/journal' },
    { id: 'nav-projects', label: 'Projects', iconName: 'FolderKanban', path: '/projects' },
    { id: 'nav-vision', label: 'Vision Board', iconName: 'Image', path: '/vision' },
    { id: 'nav-categories', label: 'Life Categories', iconName: 'Target', path: '/categories' },
    { id: 'nav-morning', label: 'Morning Flow', iconName: 'Sun', path: '/morning' },
    { id: 'nav-planning', label: 'Planning', iconName: 'ClipboardList', path: '/planning' },
    { id: 'nav-deals', label: 'Deals', iconName: 'Building2', path: '/deals' },
    { id: 'nav-trading', label: 'Trading', iconName: 'BarChart3', path: '/trading' },
    { id: 'nav-family', label: 'Family', iconName: 'Heart', path: '/family' },
    { id: 'nav-finance', label: 'Finance', iconName: 'Wallet', path: '/finance' },
    { id: 'nav-dev-projects', label: 'Dev Projects', iconName: 'GitBranch', path: '/dev-projects' },
    { id: 'nav-agents', label: 'Agents', iconName: 'Bot', path: '/agents' },
    { id: 'nav-staffing', label: 'Staffing KPIs', iconName: 'Users', path: '/staffing' },
    { id: 'nav-finances', label: 'Finances', iconName: 'Wallet', path: '/finances' },
  ],
};
