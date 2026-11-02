export type LedgerMode = 'personal_organizer' | 'standard_workspace' | 'audited_production';

export interface EfficiencyBreakdownStats {
  verifiedArtifactCount: number;
  personalExcludedCount: number;
  unverifiedExcludedCount: number;
  totalConsideredCount: number;
}

export interface ItemVerificationProof {
  hasArtifactProof: boolean;
  proofType?: 'commit_sha' | 'pr_url' | 'zkp_attestation_id' | 'ai_usage_logs';
  proofRef?: string;
}

export interface ProjectSettingsWithLedger {
  ledger_mode?: LedgerMode;
  [key: string]: any;
}

export interface WorkItemWithProjectMode {
  id: string;
  project_id: string;
  project_ledger_mode?: LedgerMode;
  status: string;
  metadata?: Record<string, any>;
  assignee?: string | null;
  item_type?: string;
  [key: string]: any;
}

export interface EfficiencyMintAttestationRecord {
  id: string;
  work_item_id: string;
  tenant_id?: string;
  project_id?: string;
  assignee?: string;
  recipient_user_id?: string;
  upkeep_hours: number;
  upkeep_tokens_minted: number;
  bounty_hours: number;
  bounty_tokens_minted: number;
  neglect_multiplier: number;
  artifact_type?: string;
  artifact_ref?: string;
  metadata?: Record<string, any>;
  attested_at: string;
}

export interface DualStreamMintResult {
  upkeepHours: number;
  upkeepTokens: number;
  bountyHours: number;
  bountyTokens: number;
  neglectMultiplier: number;
  hasArtifactProof: boolean;
  proofType?: string;
  proofRef?: string;
  isEligibleForUpkeep: boolean;
  isEligibleForBounty: boolean;
  reason?: string;
}
