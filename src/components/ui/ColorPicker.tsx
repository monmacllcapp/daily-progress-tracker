import { useCallback, useRef } from 'react';
import { X } from 'lucide-react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
}

export function ColorPicker({
  label,
  value,
  onChange,
  onClear,
}: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-7 h-7 rounded-full border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer flex-shrink-0"
        style={{ backgroundColor: value }}
        title="Pick color"
      >
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={handleColorChange}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </button>
      <span className="text-xs font-medium text-slate-300 flex-1 truncate">{label}</span>
      <span className="text-[10px] font-mono text-slate-500 uppercase">{value}</span>
      {onClear && (
        <button
          onClick={onClear}
          className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          title="Clear color"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
