import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectFocusAccordion } from '@/components/statements/ProjectFocusAccordion';
import { ProjectCalibrationGroup } from '@/lib/services/estimationCalibrationService';

const mockProjects: ProjectCalibrationGroup[] = [
  {
    projectId: 'proj-1',
    projectSlug: 'awesomany',
    projectName: 'Awesomany App',
    configuredRatio: 2.0,
    isCustomRatio: false,
    totalItems: 3,
    totalPoints: 10,
    plannedHours: 20.0,
    actualHours: 18.5,
    varianceHours: -1.5,
    empiricalRatio: 1.85,
    predictabilityIndex: 93,
    focusPercentage: 65.5,
    plannedScopePoints: 8,
    churnPoints: 2,
    items: [
      {
        id: 'item-101',
        externalRefId: 'TASK-TRK-101',
        title: 'Build UI Component',
        itemType: 'task',
        status: 'complete',
        storyPoints: 5,
        isLeaf: true,
        plannedHours: 10.0,
        actualHours: 8.5,
        loggedHours: 8.5,
        cycleTimeHours: 0,
        timeSource: 'logged',
        varianceHours: -1.5,
        varianceStatus: 'within', // within 15%
        classification: 'planned_scope',
        isChurn: false,
        completedAt: '2026-10-02T12:00:00.000Z',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
      {
        id: 'item-102',
        externalRefId: 'BUG-TRK-102',
        title: 'Fix edge case crash',
        itemType: 'bug',
        status: 'complete',
        storyPoints: 2,
        isLeaf: true,
        plannedHours: 4.0,
        actualHours: 6.0,
        loggedHours: 0,
        cycleTimeHours: 6.0,
        timeSource: 'cycle_time',
        varianceHours: 2.0,
        varianceStatus: 'over', // > 15% overrun
        classification: 'unplanned_churn',
        isChurn: true,
        churnReason: 'bug_hotfix',
        completedAt: '2026-10-03T12:00:00.000Z',
        createdAt: '2026-10-02T00:00:00.000Z',
      },
      {
        id: 'item-103',
        externalRefId: 'TASK-TRK-103',
        title: 'Quick configuration patch',
        itemType: 'task',
        status: 'complete',
        storyPoints: 3,
        isLeaf: true,
        plannedHours: 6.0,
        actualHours: 4.0,
        loggedHours: 4.0,
        cycleTimeHours: 0,
        timeSource: 'logged',
        varianceHours: -2.0,
        varianceStatus: 'under', // > 15% under envelope
        classification: 'planned_scope',
        isChurn: false,
        completedAt: '2026-10-04T12:00:00.000Z',
        createdAt: '2026-09-28T00:00:00.000Z',
      },
    ],
  },
];

describe('TASK-TRK-PROJECT-ACCORDION-UI: ProjectFocusAccordion Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders accordion header with project summary, empirical badge, and dual-meter', () => {
    render(<ProjectFocusAccordion projects={mockProjects} targetVelocityRatio={2.0} />);

    expect(screen.getByText('Awesomany App')).toBeInTheDocument();
    expect(screen.getByText('@awesomany')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('10 pts burned')).toBeInTheDocument();
    expect(screen.getByText(/Focus: 65.5%/)).toBeInTheDocument();

    // Empirical calibration badge: 1.85 hrs/pt (Target: 2.0)
    const empiricalBadge = screen.getByTestId('empirical-badge-proj-1');
    expect(empiricalBadge).toHaveTextContent('1.85 hrs/pt');
    expect(empiricalBadge).toHaveTextContent('Target: 2.0');

    // Dual meter calibration bar
    expect(screen.getByTestId('calibration-bar')).toBeInTheDocument();
  });

  it('renders item breakdown table with variance and churn tags', () => {
    render(<ProjectFocusAccordion projects={mockProjects} targetVelocityRatio={2.0} />);

    // Table rows
    expect(screen.getByTestId('item-row-item-101')).toBeInTheDocument();
    expect(screen.getByTestId('item-row-item-102')).toBeInTheDocument();
    expect(screen.getByTestId('item-row-item-103')).toBeInTheDocument();

    // Variance pills
    expect(screen.getByTestId('variance-pill-item-101')).toHaveTextContent('-1.5h');
    expect(screen.getByTestId('variance-pill-item-102')).toHaveTextContent('+2.0h');
    expect(screen.getByTestId('variance-pill-item-103')).toHaveTextContent('-2.0h');

    // Churn and planned tags
    expect(screen.getByTestId('planned-tag-item-101')).toBeInTheDocument();
    expect(screen.getByTestId('churn-tag-item-102')).toHaveTextContent('CHURN');
  });

  it('collapses and expands accordion and persists state in localStorage', () => {
    render(<ProjectFocusAccordion projects={mockProjects} targetVelocityRatio={2.0} />);

    const toggleBtn = screen.getByTestId('accordion-toggle-proj-1');
    expect(screen.getByTestId('accordion-content-proj-1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('accordion-content-proj-1')).not.toBeInTheDocument();

    // Verify localStorage persistence
    const saved = JSON.parse(localStorage.getItem('statement_accordion_state') || '{}');
    expect(saved['proj-1']).toBe(false);

    // Click to expand again
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('accordion-content-proj-1')).toBeInTheDocument();
  });

  it('clicking Ref ID triggers item drawer deep-link via URL search param', () => {
    const onSelectItem = vi.fn();
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <ProjectFocusAccordion
        projects={mockProjects}
        targetVelocityRatio={2.0}
        onSelectItem={onSelectItem}
      />
    );

    const refLink = screen.getByTestId('ref-link-TASK-TRK-101');
    fireEvent.click(refLink);

    expect(onSelectItem).toHaveBeenCalledWith('TASK-TRK-101');
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      expect.stringContaining('item=TASK-TRK-101')
    );

    pushStateSpy.mockRestore();
  });

  it('renders mobile cards layout for responsive ergonomics', () => {
    render(<ProjectFocusAccordion projects={mockProjects} targetVelocityRatio={2.0} />);

    expect(screen.getByTestId('mobile-items-list')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-item-card-item-101')).toBeInTheDocument();
  });
});
