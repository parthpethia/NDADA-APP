/**
 * Shared district constants used across admin Firms and Members screens.
 * Single source of truth — add new districts here.
 */

export const DISTRICTS = [
  'Nagpur',
  'Nagpur Gramin',
  'Hingna',
  'Kuhi',
  'Kalmeshwar',
  'Katol',
  'Narkhed',
  'Saoner',
  'Parshivani',
  'Kamthi',
  'Ramtek',
  'Mouda',
  'Umred',
  'Bhiwapur',
] as const;

export type District = (typeof DISTRICTS)[number];

/** Select options with an 'All Districts' entry for filter dropdowns */
export const DISTRICT_FILTER_OPTIONS = [
  { label: 'All Districts', value: 'all' },
  ...DISTRICTS.map((d) => ({ label: d, value: d })),
] as const;

/** Select options without the 'All' entry — for edit forms where a real value must be chosen */
export const DISTRICT_EDIT_OPTIONS = DISTRICTS.map((d) => ({
  label: d,
  value: d,
})) as { label: string; value: string }[];
