import { DEFAULT_CATEGORIES, DEFAULT_DASHBOARD_WIDGETS, DEFAULT_STATS_CHARTS } from './constants';

export const DEFAULT_DASHBOARD_WIDGET_LAYOUT = [
  { id: 'pocket', span: 2, col: 0 },
  { id: 'overview', span: 1, col: 0 },
  { id: 'money_location', span: 1, col: 1 },
  { id: 'spend_by_category', span: 1, col: 0 },
  { id: 'budgets', span: 1, col: 1 },
  { id: 'category_table', span: 2, col: 0 },
  { id: 'goals', span: 2, col: 0 },
  { id: 'deposits', span: 2, col: 1 },
  { id: 'credits_debts', span: 2, col: 0 },
] as const;

export interface FirebaseSeedDocument {
  collection: 'currencies' | 'categories' | 'settings';
  id: string;
  data: Record<string, string | number | null>;
}

export function buildFirebaseAccountSeed(
  uid: string,
  email: string,
  newId: () => string,
  now = new Date().toISOString(),
) {
  const seeds: FirebaseSeedDocument[] = [
    { collection: 'currencies', id: newId(), data: { code: 'USD', name: 'US Dollar' } },
    ...DEFAULT_CATEGORIES.map(([name, type, color]) => ({
      collection: 'categories' as const, id: newId(), data: { name, type, color },
    })),
    {
      collection: 'settings', id: newId(),
      data: {
        default_currency_code: 'USD', theme: 'system', locale: 'en-US',
        dashboard_widgets: JSON.stringify(DEFAULT_DASHBOARD_WIDGETS),
        stats_charts: JSON.stringify(DEFAULT_STATS_CHARTS),
        dashboard_widget_views: '{}',
        dashboard_widget_layout: JSON.stringify(DEFAULT_DASHBOARD_WIDGET_LAYOUT),
      },
    },
  ];
  const documents: FirebaseSeedDocument[] = seeds.map(document => ({
    ...document,
    data: { id: document.id, user_id: uid, created_at: now, updated_at: now, ...document.data },
  }));
  return {
    user: {
      uid, email: email.trim().toLowerCase(), legacy_username: null,
      created_at: now, updated_at: now, email_migration_required: false,
      marketing_email_consent: false, marketing_email_consent_at: null,
      migration_source: 'firebase',
    },
    documents,
  };
}
