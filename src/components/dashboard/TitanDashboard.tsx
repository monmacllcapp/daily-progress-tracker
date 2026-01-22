import { Settings2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { TitanGrid } from '../infra/TitanGrid';
import { CustomizationSidebar } from './CustomizationSidebar';

export function TitanDashboard() {
    const { setSidebarOpen } = useDashboardStore();

    return (
        <div className="relative w-full px-4 sm:px-6 lg:px-8 pb-20">
            {/* Dashboard Toolbar */}
            <div className="w-full mb-6 flex justify-end">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 hover:bg-slate-800 border border-white/10 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-all backdrop-blur-sm shadow-lg hover:shadow-xl hover:border-white/20"
                >
                    <Settings2 className="w-4 h-4" />
                    <span>Customize Dashboard</span>
                </button>
            </div>

            {/* Main Grid Engine */}
            <TitanGrid />

            {/* Sidebar Overlay */}
            <CustomizationSidebar />
        </div>
    );
}
