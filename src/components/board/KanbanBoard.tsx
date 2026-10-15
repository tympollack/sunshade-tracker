'use client';

import React from 'react';
import { BoardViewContainer, BoardViewContainerProps } from '@/components/views/BoardViewContainer';

export interface KanbanBoardProps extends BoardViewContainerProps {}

export function KanbanBoard(props: KanbanBoardProps) {
  return <BoardViewContainer {...props} />;
}

export default KanbanBoard;
