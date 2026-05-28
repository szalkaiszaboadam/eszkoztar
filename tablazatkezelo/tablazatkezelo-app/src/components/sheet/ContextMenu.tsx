// src/components/sheet/ContextMenu.tsx
"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

export interface MenuItem {
  label: string;
  icon: "insert-before" | "insert-after" | "delete";
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Képernyő szélén ne lógjon ki
  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 160),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 1000,
  };

  const iconMap = {
    "insert-before": <Plus className="w-3.5 h-3.5" />,
    "insert-after": <Plus className="w-3.5 h-3.5" />,
    "delete": <Trash2 className="w-3.5 h-3.5" />,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 transition ${
            item.danger ? "text-red-500" : "text-gray-700"
          }`}
        >
          <span className={item.danger ? "text-red-400" : "text-gray-400"}>
            {iconMap[item.icon]}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}