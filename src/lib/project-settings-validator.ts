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
