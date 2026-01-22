import { useDashboardStore } from '../../store/dashboardStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { BentoGrid, BentoCard } from '../BentoGrid';
import { WidgetWrapper } from './WidgetWrapper';

export function BentoDashboard() {
    const { hiddenWidgets } = useDashboardStore();

    // Map registry width to Bento spans
    const getSpan = (w: number): 'full' | 'half' | 'third' | 'two-thirds' => {
        if (w >= 12) return 'full';
        if (w >= 8) return 'two-thirds';
        if (w >= 6) return 'half';
        return 'third';
    };

    return (
        <div className="pb-20">
            <BentoGrid>
                {WIDGET_REGISTRY.map((widget) => {
                    if (hiddenWidgets.includes(widget.id)) return null;

                    const Component = widget.component;
                    const span = getSpan(widget.defaultLayout.w);

                    return (
                        <BentoCard key={widget.id} span={span} className="h-[400px]">
                            <WidgetWrapper title={widget.title}>
                                <Component />
                            </WidgetWrapper>
                        </BentoCard>
                    );
                })}
            </BentoGrid>
        </div>
    );
}
