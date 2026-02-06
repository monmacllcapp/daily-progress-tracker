import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Mail,
  BookOpen,
  FolderKanban,
  Image,
  Target,
  Sun,
  Users,
  Briefcase,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Mail,
  BookOpen,
  FolderKanban,
  Image,
  Target,
  Sun,
  Users,
  Briefcase,
  Wallet,
};

export function getIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? LayoutDashboard;
}
