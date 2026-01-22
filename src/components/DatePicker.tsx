import { useState, useRef, useEffect } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
}

export function DatePicker({ value, onChange }: DatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(
        value ? new Date(value) : null
    );
    const [selectedTime, setSelectedTime] = useState('09:00');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (number | null)[] = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }
        return days;
    };

    const handleDateSelect = (day: number) => {
        const newDate = new Date(
            currentMonth.getFullYear(),
            currentMonth.getMonth(),
            day
        );
        setSelectedDate(newDate);

        // Combine date and time
        const [hours, minutes] = selectedTime.split(':');
        newDate.setHours(parseInt(hours), parseInt(minutes));
        onChange(newDate.toISOString());

        // Auto-close after date selection
        setIsOpen(false);
    };

    const handleTimeChange = (time: string) => {
        setSelectedTime(time);
        if (selectedDate) {
            const [hours, minutes] = time.split(':');
            const newDate = new Date(selectedDate);
            newDate.setHours(parseInt(hours), parseInt(minutes));
            onChange(newDate.toISOString());
        }
    };

    const formatDisplayDate = () => {
        if (!selectedDate) return 'Due date';
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (selectedDate.toDateString() === today.toDateString()) {
            return `Today ${selectedTime}`;
        } else if (selectedDate.toDateString() === tomorrow.toDateString()) {
            return `Tmrw ${selectedTime}`;
        } else {
            return selectedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            }) + ` ${selectedTime}`;
        }
    };

    const days = getDaysInMonth(currentMonth);
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    return (
        <div className="relative" ref={pickerRef}>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={`relative z-50 pointer-events-auto flex items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all text-xs whitespace-nowrap ${selectedDate
                    ? 'bg-emerald-500 bg-opacity-10 border-emerald-500 border-opacity-30 text-emerald-400'
                    : 'bg-white bg-opacity-5 border-white border-opacity-10 text-secondary hover:bg-white hover:bg-opacity-10'
                    }`}
            >
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDisplayDate()}</span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute bottom-full mb-2 right-0 z-[9999] bg-zinc-900 border border-white border-opacity-10 rounded-lg shadow-2xl p-2 w-56"
                    >
                        {/* Compact Month/Year Navigation */}
                        <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
                                }}
                                className="p-0.5 hover:bg-white hover:bg-opacity-10 rounded text-xs w-5 h-5 flex items-center justify-center"
                            >
                                ←
                            </button>
                            <span className="font-medium text-[11px]">{monthName}</span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
                                }}
                                className="p-0.5 hover:bg-white hover:bg-opacity-10 rounded text-xs w-5 h-5 flex items-center justify-center"
                            >
                                →
                            </button>
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-0.5 mb-1.5">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <div key={i} className="text-center text-[9px] text-secondary font-medium py-0.5">
                                    {day}
                                </div>
                            ))}
                            {days.map((day, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        day && handleDateSelect(day);
                                    }}
                                    disabled={!day}
                                    className={`aspect-square rounded text-[10px] transition-all ${!day
                                        ? 'invisible'
                                        : selectedDate?.getDate() === day &&
                                            selectedDate?.getMonth() === currentMonth.getMonth()
                                            ? 'bg-emerald-500 text-white font-bold'
                                            : 'hover:bg-white hover:bg-opacity-10'
                                        }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>

                        {/* Time Picker */}
                        <div className="flex items-center gap-1 pt-1 border-t border-white border-opacity-10">
                            <Clock className="w-3 h-3 text-secondary flex-shrink-0" />
                            <input
                                type="time"
                                value={selectedTime}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    handleTimeChange(e.target.value);
                                }}
                                className="flex-1 px-1.5 py-0.5 bg-white bg-opacity-5 border border-white border-opacity-10 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            {selectedDate && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(null);
                                        onChange('');
                                        setIsOpen(false);
                                    }}
                                    className="p-0.5 hover:bg-red-500 hover:bg-opacity-20 rounded text-red-400 transition-all flex-shrink-0"
                                    title="Clear"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
