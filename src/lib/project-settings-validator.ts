/**
 * Project Settings Schema & Automation Validator
 *
 * Enforces schema integrity on project settings mutations, validating
 * triggers and template action targets.
 */

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates project settings payload for automations and templates structure.
 */
export function validateProjectSettings(settings: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!settings || typeof settings !== 'object') {
    return {
      valid: false,
      errors: [{ path: 'settings', message: 'Settings must be an object' }],
    };
  }

  // Validate github_repo if present
  if ('github_repo' in settings && settings.github_repo !== null && settings.github_repo !== undefined) {
    if (typeof settings.github_repo !== 'string') {
      errors.push({
        path: 'github_repo',
        message: 'github_repo must be a string (e.g. "owner/repo")',
      });
    }
  }

  // Validate sprint_metrics if present
  if ('sprint_metrics' in settings && settings.sprint_metrics !== null && settings.sprint_metrics !== undefined) {
    if (typeof settings.sprint_metrics !== 'object' || Array.isArray(settings.sprint_metrics)) {
      errors.push({
        path: 'sprint_metrics',
        message: 'sprint_metrics must be a JSON object containing metric governance rules',
      });
    } else {
      const sm = settings.sprint_metrics;
      if ('velocity_window' in sm && (typeof sm.velocity_window !== 'number' || sm.velocity_window < 1)) {
        errors.push({
          path: 'sprint_metrics.velocity_window',
          message: 'velocity_window must be a positive integer >= 1',
        });
      }
      if ('late_runway_threshold' in sm && (typeof sm.late_runway_threshold !== 'number' || sm.late_runway_threshold < 0 || sm.late_runway_threshold > 1)) {
        errors.push({
          path: 'sprint_metrics.late_runway_threshold',
          message: 'late_runway_threshold must be a decimal between 0 and 1 (e.g. 0.60)',
        });
      }
      if ('late_runway_max_points' in sm && (typeof sm.late_runway_max_points !== 'number' || sm.late_runway_max_points < 0)) {
        errors.push({
          path: 'sprint_metrics.late_runway_max_points',
          message: 'late_runway_max_points must be a non-negative number',
        });
      }
      if ('reliability_healthy_threshold' in sm && (typeof sm.reliability_healthy_threshold !== 'number' || sm.reliability_healthy_threshold < 0 || sm.reliability_healthy_threshold > 100)) {
        errors.push({
          path: 'sprint_metrics.reliability_healthy_threshold',
          message: 'reliability_healthy_threshold must be a percentage between 0 and 100',
        });
      }
      if ('reliability_warning_threshold' in sm && (typeof sm.reliability_warning_threshold !== 'number' || sm.reliability_warning_threshold < 0 || sm.reliability_warning_threshold > 100)) {
        errors.push({
          path: 'sprint_metrics.reliability_warning_threshold',
          message: 'reliability_warning_threshold must be a percentage between 0 and 100',
        });
      }
    }
  }

  // 1. Validate automations if present
  if ('automations' in settings && settings.automations !== null && settings.automations !== undefined) {
    if (!Array.isArray(settings.automations)) {
      errors.push({
        path: 'automations',
        message: 'Automations must be an array of automation rules',
      });
    } else {
      settings.automations.forEach((rule: any, index: number) => {
        const basePath = `automations[${index}]`;

        if (!rule || typeof rule !== 'object') {
          errors.push({
            path: basePath,
            message: 'Automation rule must be an object',
          });
          return;
        }

        // Validate trigger
        if (!rule.trigger || typeof rule.trigger !== 'object') {
          errors.push({
            path: `${basePath}.trigger`,
            message: 'Malformed trigger: trigger object is required',
          });
        } else if (typeof rule.trigger.type !== 'string' || !rule.trigger.type.trim()) {
          errors.push({
            path: `${basePath}.trigger.type`,
            message: 'Malformed trigger: trigger.type is required and must be a non-empty string',
          });
        }

        // Validate actions / action
        const actionsList: any[] = Array.isArray(rule.actions)
          ? rule.actions
          : rule.action
          ? [rule.action]
          : [];

        if (!rule.actions && !rule.action) {
          errors.push({
            path: `${basePath}.actions`,
            message: 'Automation rule must specify at least one action',
          });
        } else if (rule.actions && !Array.isArray(rule.actions)) {
          errors.push({
            path: `${basePath}.actions`,
            message: 'Actions must be an array',
          });
        } else {
          actionsList.forEach((action: any, actionIndex: number) => {
            const actionPath = Array.isArray(rule.actions)
              ? `${basePath}.actions[${actionIndex}]`
              : `${basePath}.action`;

            if (!action || typeof action !== 'object') {
              errors.push({
                path: actionPath,
                message: 'Action must be an object',
              });
              return;
            }

            // Check for template action target requirements
            const isTemplateAction =
              action.type === 'apply_template' ||
              action.type === 'template' ||
              action.type === 'execute_template' ||
              Boolean(action.template);

            if (isTemplateAction) {
              const target = action.target ?? action.template_id ?? action.template;
              if (target === undefined || target === null || (typeof target === 'string' && !target.trim())) {
                errors.push({
                  path: `${actionPath}.target`,
                  message: 'Missing template action target: target is required for template actions',
                });
              }
            } else if ('target' in action) {
              if (action.target === undefined || action.target === null || (typeof action.target === 'string' && !action.target.trim())) {
                errors.push({
                  path: `${actionPath}.target`,
                  message: 'Missing template action target: target cannot be empty',
                });
              }
            }
          });
        }
      });
    }
  }

  // 2. Validate templates if present
  if ('templates' in settings && settings.templates !== null && settings.templates !== undefined) {
    if (Array.isArray(settings.templates)) {
      settings.templates.forEach((tmpl: any, index: number) => {
        const tmplPath = `templates[${index}]`;
        if (!tmpl || typeof tmpl !== 'object') {
          errors.push({
            path: tmplPath,
            message: 'Template must be an object',
          });
          return;
        }

        if (Array.isArray(tmpl.actions)) {
          tmpl.actions.forEach((act: any, actIndex: number) => {
            const actPath = `${tmplPath}.actions[${actIndex}]`;
            if (act && typeof act === 'object' && ('target' in act || act.type === 'apply_template')) {
              const target = act.target ?? act.template_id;
              if (target === undefined || target === null || (typeof target === 'string' && !target.trim())) {
                errors.push({
                  path: `${actPath}.target`,
                  message: 'Missing template action target: target is required',
                });
              }
            }
          });
        }
      });
    } else if (typeof settings.templates === 'object') {
      Object.entries(settings.templates).forEach(([key, tmpl]: [string, any]) => {
        const tmplPath = `templates.${key}`;
        if (tmpl && typeof tmpl === 'object' && Array.isArray(tmpl.actions)) {
          tmpl.actions.forEach((act: any, actIndex: number) => {
            const actPath = `${tmplPath}.actions[${actIndex}]`;
            if (act && typeof act === 'object' && ('target' in act || act.type === 'apply_template')) {
              const target = act.target ?? act.template_id;
              if (target === undefined || target === null || (typeof target === 'string' && !target.trim())) {
                errors.push({
                  path: `${actPath}.target`,
                  message: 'Missing template action target: target is required',
                });
              }
            }
          });
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
