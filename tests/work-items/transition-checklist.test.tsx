import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionChecklist } from '@/components/work-items/TransitionChecklist';
import type { ProjectSettings, WorkItem } from '@/types/tracker';

describe('TASK-TRK-SCHEMA-DRIVEN-VERIFICATION-UI: TransitionChecklist', () => {
  const dynamicSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
      { id: 'complete', label: 'Complete', color: '#10b981', order: 4, is_completed: true },
    ],
    custom_fields: [
      { key: 'peer_reviewer', label: 'Peer Reviewer', type: 'string' },
      { key: 'signoff_score', label: 'Signoff Score', type: 'number' },
      { key: 'requires_audit', label: 'Requires Audit', type: 'boolean' },
    ],
    transition_guards: [
      {
        id: 'guard-review-audit',
        name: 'Audit Gate for In Review',
        enabled: true,
        target_status: 'in_review',
        when: [
          {
            field: 'metadata.requires_audit',
            operator: '$eq',
            value: true,
          },
        ],
        conditions: [
          {
            field: 'metadata.peer_reviewer',
            operator: '$is_not_null',
            message: 'Peer reviewer identity must be specified before review.',
          },
          {
            field: 'metadata.signoff_score',
            operator: '$gte',
            value: 8,
            message: 'Signoff score must be 8 or higher.',
          },
        ],
      },
      {
        id: 'guard-complete-unconditional',
        name: 'Completion Signoff',
        enabled: true,
        target_status: 'complete',
        conditions: [
          {
            field: 'metadata.final_notes',
            operator: '$is_not_null',
            message: 'Final delivery notes required.',
          },
        ],
      },
    ],
  };

  it('renders nothing when no guards match targetStatus or exist', () => {
    const { container } = render(
      <TransitionChecklist
        item={{ id: 'it-1', status: 'not_started', metadata: {} }}
        projectSettings={dynamicSettings}
        targetStatus="not_started"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders requirements checklist with active/exempt badges based on when clause', () => {
    // Item where requires_audit is true -> subject to rule
    const applicableItem = {
      id: 'it-audit-1',
      status: 'in_progress',
      metadata: {
        requires_audit: true,
        peer_reviewer: 'reviewer_bob',
        signoff_score: 5, // unmet (needs >= 8)
      },
    };

    const { rerender } = render(
      <TransitionChecklist
        item={applicableItem}
        projectSettings={dynamicSettings}
        targetStatus="in_review"
      />
    );

    expect(screen.getByTestId('transition-checklist-panel')).toBeInTheDocument();
    expect(screen.getByText('Audit Gate for In Review')).toBeInTheDocument();
    expect(screen.getByTestId('guard-exemption-badge-guard-review-audit')).toHaveTextContent('Subject to Rule');

    // peer_reviewer is met
    expect(screen.getByTestId('checklist-item-met-peer_reviewer')).toBeInTheDocument();
    // signoff_score is unmet
    expect(screen.getByTestId('checklist-item-unmet-signoff_score')).toBeInTheDocument();

    // Rerender with requires_audit = false -> exempt from rule
    const exemptItem = {
      id: 'it-audit-1',
      status: 'in_progress',
      metadata: {
        requires_audit: false,
      },
    };

    rerender(
      <TransitionChecklist
        item={exemptItem}
        projectSettings={dynamicSettings}
        targetStatus="in_review"
      />
    );

    expect(screen.getByTestId('guard-exemption-badge-guard-review-audit')).toHaveTextContent('Exempt from Rule');
    expect(screen.getByTestId('checklist-item-exempt-peer_reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-item-exempt-signoff_score')).toBeInTheDocument();
  });

  it('provides interactive dynamic input controls and updates reactively', () => {
    const onUpdateField = vi.fn();
    const item = {
      id: 'it-audit-2',
      status: 'in_progress',
      metadata: {
        requires_audit: true,
      },
    };

    render(
      <TransitionChecklist
        item={item}
        projectSettings={dynamicSettings}
        targetStatus="in_review"
        onUpdateField={onUpdateField}
      />
    );

    // Text input for peer_reviewer
    const peerInput = screen.getByTestId('checklist-input-peer_reviewer');
    expect(peerInput).toBeInTheDocument();
    fireEvent.change(peerInput, { target: { value: 'alice_reviewer' } });
    expect(onUpdateField).toHaveBeenCalledWith('peer_reviewer', 'alice_reviewer', 'metadata.peer_reviewer');

    // Number input for signoff_score
    const scoreInput = screen.getByTestId('checklist-input-signoff_score');
    expect(scoreInput).toBeInTheDocument();
    fireEvent.change(scoreInput, { target: { value: '9' } });
    expect(onUpdateField).toHaveBeenCalledWith('signoff_score', 9, 'metadata.signoff_score');
  });

  it('renders and supports updating core property requirements such as assignee', () => {
    const onUpdateField = vi.fn();
    const coreSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      ],
      custom_fields: [],
      transition_guards: [
        {
          id: 'guard-start-assignee',
          name: 'Require Assignee to Start',
          enabled: true,
          target_status: 'in_progress',
          conditions: [
            {
              field: 'item.assignee',
              operator: '$is_not_null',
              message: 'Task must be assigned to an engineer before starting.',
            },
          ],
        },
      ],
    };

    render(
      <TransitionChecklist
        item={{ id: 'task-core-1', status: 'not_started', assignee: null }}
        projectSettings={coreSettings}
        targetStatus="in_progress"
        onUpdateField={onUpdateField}
      />
    );

    expect(screen.getByTestId('checklist-item-unmet-assignee')).toBeInTheDocument();
    const assigneeInput = screen.getByTestId('checklist-input-assignee');
    fireEvent.change(assigneeInput, { target: { value: 'alice' } });
    expect(onUpdateField).toHaveBeenCalledWith('assignee', 'alice', 'item.assignee');
  });

  it('does not contain hardcoded domain-specific terms in templates', () => {
    const customDomainSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [{ type: 'inspection', label: 'Inspection', level: 1, allowed_parents: [] }],
      statuses: [
        { id: 'draft', label: 'Draft', color: '#94a3b8', order: 1 },
        { id: 'submitted', label: 'Submitted', color: '#10b981', order: 2 },
      ],
      custom_fields: [{ key: 'inspector_license_number', label: 'Inspector License', type: 'string' }],
      transition_guards: [
        {
          id: 'guard-inspection-license',
          name: 'Verify Certified Inspector',
          enabled: true,
          target_status: 'submitted',
          conditions: [
            {
              field: 'metadata.inspector_license_number',
              operator: '$is_not_null',
              message: 'State certified inspector license must be entered.',
            },
          ],
        },
      ],
    };

    render(
      <TransitionChecklist
        item={{ id: 'insp-1', status: 'draft', metadata: {} }}
        projectSettings={customDomainSettings}
        targetStatus="submitted"
      />
    );

    expect(screen.getByText('Verify Certified Inspector')).toBeInTheDocument();
    expect(screen.getByText('State certified inspector license must be entered.')).toBeInTheDocument();
    expect(screen.queryByText(/PR/i)).toBeNull();
    expect(screen.queryByText(/Commit/i)).toBeNull();
  });
});
