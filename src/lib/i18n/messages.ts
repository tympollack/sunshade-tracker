export const DEFAULT_LOCALE = 'en' as const;

export const EN_MESSAGES = {
  // Public Bounty Gateway
  'bounty.gateway.badge': 'Public Roadmap & Bounties',
  'bounty.gateway.title': '{tenantName} Bounty Gateway',
  'bounty.gateway.subtitle':
    'Autonomous agents and open-source contributors can claim tasks and submit pull requests for automated reward verification.',
  'bounty.gateway.viewBoard': 'View Full Board',
  'bounty.gateway.privateTitle': 'Private Workspace',
  'bounty.gateway.privateDescription':
    'Workspace "{tenantSlug}" is private. Only authenticated members can view internal roadmap items and bounties.',
  'bounty.gateway.signIn': 'Sign In with Workspace Account',
  'bounty.gateway.columns.not_started': 'Open Bounties',
  'bounty.gateway.columns.in_progress': 'Claimed / In Progress',
  'bounty.gateway.columns.in_review': 'Under Review',
  'bounty.gateway.columns.complete': 'Completed & Verified',
  'bounty.gateway.emptyColumn': 'No items in this column',
  'bounty.gateway.banner.title': 'Sovereign 20-Hour Token Economy',
  'bounty.gateway.banner.badge': 'Closed-Loop Work Rebate',
  'bounty.gateway.banner.subtitle':
    'Anchored to 1,200,000 Tokens/Week (60,000 Tokens/Hr · 1,000 Tokens/Min) with dynamic neglect surge pricing up to 2.00x.',
  'bounty.gateway.banner.dormancyChip': 'Up to 2.0x Dormancy Bonus',
  'bounty.gateway.banner.proofChip': 'Artifact Proof Guard',
  'bounty.gateway.steps.claimTitle': '1. Claim with CLI',
  'bounty.gateway.steps.referenceTitle': '2. Reference in PR',
  'bounty.gateway.steps.referenceDesc': 'Include Ref ID in PR title:',
  'bounty.gateway.steps.rewardTitle': '3. Automated Reward',
  'bounty.gateway.steps.rewardDesc':
    'Merge automatically moves card to Complete and verifies bounty.',
  'bounty.gateway.card.unassigned': 'Unassigned',
  'bounty.gateway.card.hoursEstimate': '{hours} hrs est.',
  'bounty.gateway.card.prLink': 'PR',
  'bounty.gateway.card.proofRequired': 'Proof Req.',

  // Bounty Reward Calculator & Badges
  'bounty.reward.tokens': '{amount} Tokens',
  'bounty.reward.tokensWithBadges': '{amount} Tokens ({badges})',
  'bounty.reward.badge.neglect': '{multiplier}x Neglect',
  'bounty.reward.badge.neglectYield': '{multiplier}x Neglect Yield',
  'bounty.reward.badge.efficiency': '{factor}x Efficiency',
  'bounty.reward.badge.processEfficiency': '{factor}x Process Efficiency',
  'bounty.reward.badge.patronBoost': '+{amount} Patron Boost',
  'bounty.reward.dormancyDetail': '{multiplier}x Neglect Yield (+{days}d dormant)',

  // Project Schema Editor — Process Efficiency Factor
  'schema.processEfficiency.title': 'Process Efficiency Factor',
  'schema.processEfficiency.ariaLabel': 'Process efficiency factor',
  'schema.processEfficiency.help': 'Bounty multiplier (0.10x – 5.00x).',
  'schema.processEfficiency.ratePreview': '{factor}x ({tokensPerHour} Tokens/hr)',

  // Oversight Graduation Ladder Tiers
  'patronage.tier.leaf_contributor': 'Leaf Contributor',
  'patronage.tier.force_multiplier': 'Force Multiplier',
  'patronage.tier.bounty_patron': 'Bounty Patron',
  'patronage.tier.oversight_steward': 'Oversight Steward',
} as const;

export type TranslationKey = keyof typeof EN_MESSAGES;
export type MessageCatalog = Record<TranslationKey, string>;

export const ES_MESSAGES: MessageCatalog = {
  'bounty.gateway.badge': 'Hoja de Ruta Pública y Recompensas',
  'bounty.gateway.title': 'Portal de Recompensas de {tenantName}',
  'bounty.gateway.subtitle':
    'Agentes autónomos y colaboradores de código abierto pueden reclamar tareas y enviar pull requests para verificación automática.',
  'bounty.gateway.viewBoard': 'Ver Tablero Completo',
  'bounty.gateway.privateTitle': 'Espacio de Trabajo Privado',
  'bounty.gateway.privateDescription':
    'El espacio de trabajo "{tenantSlug}" es privado. Solo los miembros autenticados pueden ver elementos y recompensas internas.',
  'bounty.gateway.signIn': 'Iniciar Sesión con Cuenta del Espacio',
  'bounty.gateway.columns.not_started': 'Recompensas Abiertas',
  'bounty.gateway.columns.in_progress': 'Reclamadas / En Progreso',
  'bounty.gateway.columns.in_review': 'En Revisión',
  'bounty.gateway.columns.complete': 'Completadas y Verificadas',
  'bounty.gateway.emptyColumn': 'No hay elementos en esta columna',
  'bounty.gateway.banner.title': 'Economía Soberana de Tokens de 20 Horas',
  'bounty.gateway.banner.badge': 'Reembolso de Trabajo en Circuito Cerrado',
  'bounty.gateway.banner.subtitle':
    'Anclado a 1,200,000 Tokens/Semana (60,000 Tokens/Hr · 1,000 Tokens/Min) con ajuste dinámico por inactividad hasta 2.00x.',
  'bounty.gateway.banner.dormancyChip': 'Hasta 2.0x Bono por Inactividad',
  'bounty.gateway.banner.proofChip': 'Guardia de Prueba de Artefacto',
  'bounty.gateway.steps.claimTitle': '1. Reclamar con CLI',
  'bounty.gateway.steps.referenceTitle': '2. Referenciar en PR',
  'bounty.gateway.steps.referenceDesc': 'Incluye el ID de referencia en el título del PR:',
  'bounty.gateway.steps.rewardTitle': '3. Recompensa Automática',
  'bounty.gateway.steps.rewardDesc':
    'Al fusionar, la tarjeta pasa a Completada y verifica la recompensa.',
  'bounty.gateway.card.unassigned': 'Sin asignar',
  'bounty.gateway.card.hoursEstimate': '{hours} h est.',
  'bounty.gateway.card.prLink': 'PR',
  'bounty.gateway.card.proofRequired': 'Prueba Req.',

  'bounty.reward.tokens': '{amount} Tokens',
  'bounty.reward.tokensWithBadges': '{amount} Tokens ({badges})',
  'bounty.reward.badge.neglect': '{multiplier}x Inactividad',
  'bounty.reward.badge.neglectYield': '{multiplier}x Rendimiento por Inactividad',
  'bounty.reward.badge.efficiency': '{factor}x Eficiencia',
  'bounty.reward.badge.processEfficiency': '{factor}x Eficiencia de Proceso',
  'bounty.reward.badge.patronBoost': '+{amount} Impulso de Mecenas',
  'bounty.reward.dormancyDetail': '{multiplier}x Rendimiento por Inactividad (+{days}d inactivo)',

  'schema.processEfficiency.title': 'Factor de Eficiencia de Proceso',
  'schema.processEfficiency.ariaLabel': 'Factor de eficiencia de proceso',
  'schema.processEfficiency.help': 'Multiplicador de recompensa (0.10x – 5.00x).',
  'schema.processEfficiency.ratePreview': '{factor}x ({tokensPerHour} Tokens/hr)',

  'patronage.tier.leaf_contributor': 'Colaborador Inicial',
  'patronage.tier.force_multiplier': 'Multiplicador de Fuerza',
  'patronage.tier.bounty_patron': 'Mecenas de Recompensas',
  'patronage.tier.oversight_steward': 'Custodio de Supervisión',
};

export const MESSAGE_CATALOGS: Record<string, Partial<MessageCatalog>> = {
  en: EN_MESSAGES,
  es: ES_MESSAGES,
};
