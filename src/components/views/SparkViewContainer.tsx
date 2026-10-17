'use client';

export * from '@/components/ingestion/IngestionDialog';
import { IngestionDialog, IngestionDialogProps } from '@/components/ingestion/IngestionDialog';

export type SparkViewContainerProps = IngestionDialogProps;
export const SparkViewContainer = IngestionDialog;
export default IngestionDialog;
