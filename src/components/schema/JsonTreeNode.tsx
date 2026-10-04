'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface JsonTreeNodeProps {
  name: string | number;
  value: any;
  path: (string | number)[];
  depth: number;
  collapseLevel: number;
  onUpdateValue: (path: (string | number)[], newValue: any) => void;
  readOnly?: boolean;
}

export function JsonTreeNode({
  name,
  value,
  path,
  depth,
  collapseLevel,
  onUpdateValue,
  readOnly = false,
}: JsonTreeNodeProps) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  const [isOpen, setIsOpen] = useState(depth < collapseLevel);

  useEffect(() => {
    setIsOpen(depth < collapseLevel);
  }, [collapseLevel, depth]);

  const colorInputRef = useRef<HTMLInputElement>(null);
  const isHexColor = typeof value === 'string' && HEX_COLOR_REGEX.test(value);

  if (isObject) {
    const keys = Object.keys(value);
    const count = keys.length;

    return (
      <div className="my-0.5">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-1.5 py-0.5 px-1 rounded hover:bg-slate-900/80 cursor-pointer select-none group"
        >
          <button
            type="button"
            className="p-0.5 text-slate-500 group-hover:text-slate-300 transition-colors"
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {typeof name === 'string' && name !== 'schema' && (
            <span className="text-sky-300 font-semibold">&quot;{name}&quot;: </span>
          )}
          {typeof name === 'number' && (
            <span className="text-slate-500 font-semibold">[{name}]: </span>
          )}

          <span className="text-slate-400">
            {isArray ? '[' : '{'}
          </span>

          {!isOpen && (
            <span className="text-slate-500 text-[11px] italic px-1 rounded bg-slate-900">
              {isArray ? `${count} item${count !== 1 ? 's' : ''}` : `${count} key${count !== 1 ? 's' : ''}`}
            </span>
          )}

          {!isOpen && (
            <span className="text-slate-400">{isArray ? ']' : '}'}</span>
          )}
        </div>

        {isOpen && (
          <div className="border-l border-slate-800/80 ml-3.5 pl-3 space-y-0.5">
            {keys.map((k) => {
              const childKey = isArray ? Number(k) : k;
              return (
                <JsonTreeNode
                  key={k}
                  name={childKey}
                  value={value[k]}
                  path={[...path, childKey]}
                  depth={depth + 1}
                  collapseLevel={collapseLevel}
                  onUpdateValue={onUpdateValue}
                  readOnly={readOnly}
                />
              );
            })}
            <div className="text-slate-400 px-1">{isArray ? ']' : '}'}</div>
          </div>
        )}
      </div>
    );
  }

  // Primitive value rendering
  return (
    <div className="flex items-center space-x-1.5 py-0.5 px-1 ml-4 rounded hover:bg-slate-900/60 group">
      {typeof name === 'string' && (
        <span className="text-sky-300 font-semibold">&quot;{name}&quot;: </span>
      )}
      {typeof name === 'number' && (
        <span className="text-slate-500 font-semibold">[{name}]: </span>
      )}

      {/* Hex Color Display with Interactive Color Swatch & Native Color Picker */}
      {isHexColor ? (
        <div className="flex items-center space-x-1.5">
          <div
            onClick={() => !readOnly && colorInputRef.current?.click()}
            className={`w-4 h-4 rounded border border-white/20 shadow-sm relative inline-flex items-center justify-center shrink-0 ${
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'
            }`}
            style={{ backgroundColor: value }}
            title={readOnly ? `Color: ${value}` : `Click to change color (${value})`}
          >
            {!readOnly && (
              <input
                ref={colorInputRef}
                type="color"
                value={value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value}
                onChange={(e) => onUpdateValue(path, e.target.value)}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer pointer-events-auto"
              />
            )}
          </div>

          <span className="text-emerald-300 font-bold">&quot;{value}&quot;</span>
        </div>
      ) : typeof value === 'string' ? (
        <span className="text-emerald-300">&quot;{value}&quot;</span>
      ) : typeof value === 'number' ? (
        <span className="text-amber-300 font-bold">{value}</span>
      ) : typeof value === 'boolean' ? (
        <span className="text-purple-400 font-bold">{String(value)}</span>
      ) : value === null ? (
        <span className="text-slate-500 italic">null</span>
      ) : (
        <span className="text-slate-300">{String(value)}</span>
      )}
    </div>
  );
}
