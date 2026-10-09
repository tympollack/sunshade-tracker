import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VelocitySettingsPopover } from '@/components/statements/VelocitySettingsPopover';

const mockProjects = [
  {
    id: 'proj-alpha',
    name: 'Awesomany App',
    slug: 'awesomany',
    currentRatio: 3.0,
    isCustom: true,
  },
  {
    id: 'proj-beta',
    name: 'Core Infra',
    slug: 'core-infra',
    currentRatio: 2.0,
    isCustom: false,
  },
];

describe('TASK-TRK-VELOCITY-SETTINGS-POPOVER: VelocitySettingsPopover Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders toolbar trigger with target velocity ratio', () => {
    render(<VelocitySettingsPopover tenantSlug="pym-energy" defaultRatio={2.0} />);

    const trigger = screen.getByTestId('velocity-settings-trigger');
    expect(trigger).toHaveTextContent('Target Velocity:');
    expect(trigger).toHaveTextContent('2.0 hrs/pt');
  });

  it('opens configuration popover on trigger click', () => {
    render(
      <VelocitySettingsPopover
        tenantSlug="pym-energy"
        defaultRatio={2.0}
        projects={mockProjects}
      />
    );

    const trigger = screen.getByTestId('velocity-settings-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('velocity-settings-popover')).toBeInTheDocument();
    expect(screen.getByTestId('current-baseline-value')).toHaveTextContent('2.00');
    expect(screen.getByTestId('baseline-ratio-slider')).toBeInTheDocument();
  });

  it('adjusts baseline ratio with slider within [0.5, 8.0]', () => {
    render(<VelocitySettingsPopover tenantSlug="pym-energy" defaultRatio={2.0} />);

    fireEvent.click(screen.getByTestId('velocity-settings-trigger'));

    const slider = screen.getByTestId('baseline-ratio-slider');
    fireEvent.change(slider, { target: { value: '3.25' } });

    expect(screen.getByTestId('current-baseline-value')).toHaveTextContent('3.25');
  });

  it('triggers onRatioSimulate callback when live simulation toggle is flipped', () => {
    const onRatioSimulate = vi.fn();

    render(
      <VelocitySettingsPopover
        tenantSlug="pym-energy"
        defaultRatio={2.0}
        onRatioSimulate={onRatioSimulate}
      />
    );

    fireEvent.click(screen.getByTestId('velocity-settings-trigger'));

    const simulateToggle = screen.getByTestId('simulate-ratio-toggle');
    fireEvent.click(simulateToggle);

    expect(onRatioSimulate).toHaveBeenCalledWith(2.0);

    // Toggle off
    fireEvent.click(simulateToggle);
    expect(onRatioSimulate).toHaveBeenCalledWith(null);
  });

  it('persists velocity settings through onSave callback on save click', async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true, error: null });
    const onSettingsSaved = vi.fn();

    render(
      <VelocitySettingsPopover
        tenantSlug="pym-energy"
        defaultRatio={2.0}
        projects={mockProjects}
        onSave={onSave}
        onSettingsSaved={onSettingsSaved}
      />
    );

    fireEvent.click(screen.getByTestId('velocity-settings-trigger'));

    const slider = screen.getByTestId('baseline-ratio-slider');
    fireEvent.change(slider, { target: { value: '2.5' } });

    const saveBtn = screen.getByTestId('save-velocity-settings-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'pym-energy',
        expect.objectContaining({
          defaultHoursPerPoint: 2.5,
        })
      );
    });

    expect(onSettingsSaved).toHaveBeenCalledWith(2.5);
  });
});
