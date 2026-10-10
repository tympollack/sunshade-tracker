'use client';

import React, { useState, useRef, useEffect } from 'react';
import { WorkItem, StatusDefinition, ProjectSettings, CustomMetadataFieldDefinition } from '@/types/tracker';
import { WorkItemInspectorDrawer } from './WorkItemInspectorDrawer';

export interface MobileItemBottomSheetProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<WorkItem> & { metadata?: Record<string, any> }
  ) => Promise<void> | void;
  onExpandFull?: (item: WorkItem) => void;
  availableStatuses?: StatusDefinition[];
  availableSprints?: string[];
  availableAssignees?: string[];
  allItems?: WorkItem[];
  isReadOnly?: boolean;
  tenantSlug: string;
  projectSlug?: string;
  projectSettings?: ProjectSettings | null;
  customMetadataFields?: CustomMetadataFieldDefinition[];
}

export function MobileItemBottomSheet(props: MobileItemBottomSheetProps) {
  const { isOpen, onClose, item } = props;
  const [snapPoint, setSnapPoint] = useState<'peek' | 'full'>('peek');
  const touchStartY = useRef<number | null>(null);
  const currentTranslateY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSnapPoint('peek');
      setDragOffset(0);
    }
  }, [isOpen]);

  if (!isOpen || !item) {
    return null;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 0) {
      // Dragging downward
      setDragOffset(deltaY);
    } else if (snapPoint === 'peek' && deltaY < -40) {
      // Dragging upward from peek switches to full
      setSnapPoint('full');
      setDragOffset(0);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 120) {
      // Dragged down significantly: dismiss
      onClose();
    } else if (dragOffset > 60 && snapPoint === 'full') {
      // Dragged down moderately from full: collapse to peek
      setSnapPoint('peek');
      setDragOffset(0);
    } else {
      // Reset position
      setDragOffset(0);
    }
    touchStartY.current = null;
  };

  const heightClass = snapPoint === 'full' ? 'h-[90vh]' : 'h-[50vh]';

  return (
    <div
      data-testid="mobile-item-bottom-sheet"
      className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Backdrop */}
      <div
        data-testid="bottom-sheet-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        data-testid="bottom-sheet-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out, height 0.2s ease-out',
        }}
        className={`relative z-10 w-full ${heightClass} bg-slate-900 border-t border-slate-700/80 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]`}
      >
        {/* Grab Handle */}
        <div className="w-full flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0 bg-slate-950/40">
          <div
            data-testid="sheet-drag-handle"
            className="w-12 h-1.5 rounded-full bg-slate-600/80 hover:bg-slate-500 transition-colors"
          />
        </div>

        {/* Inner Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <WorkItemInspectorDrawer {...props} />
        </div>
      </div>
    </div>
  );
}
