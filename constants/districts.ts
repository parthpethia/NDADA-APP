/**
 * Shared taluka constants used across admin Firms and Members screens.
 * Single source of truth — list of talukas in Nagpur district.
 */

export const TALUKAS = [
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

export type Taluka = (typeof TALUKAS)[number];

// Alias for backward compatibility with database column naming
export const DISTRICTS = TALUKAS;
export type District = Taluka;

/** Select options with an 'All Talukas' entry for filter dropdowns */
export const TALUKA_FILTER_OPTIONS = [
  { label: 'All Talukas', value: 'all' },
  ...TALUKAS.map((d) => ({ label: d, value: d })),
] as const;

export const DISTRICT_FILTER_OPTIONS = TALUKA_FILTER_OPTIONS;

/** Select options without the 'All' entry — for edit forms where a real value must be chosen */
export const TALUKA_EDIT_OPTIONS = TALUKAS.map((d) => ({
  label: d,
  value: d,
})) as { label: string; value: string }[];

export const DISTRICT_EDIT_OPTIONS = TALUKA_EDIT_OPTIONS;

