export type NavigationStrategyMode = 'UNIFIED';

/**
 * Unified Navigation Strategy:
 * - Immediate imperative router.replace() in login.tsx upon sign-in success.
 * - Declarative session guard in (auth)/_layout.tsx to prevent access to auth routes when logged in.
 * - Reactive useEffect fallback in login.tsx when session and profile state settle.
 */
export let ACTIVE_NAVIGATION_STRATEGY: NavigationStrategyMode = 'UNIFIED';

export function setNavigationStrategy(mode: NavigationStrategyMode) {
  ACTIVE_NAVIGATION_STRATEGY = mode;
  console.log(`[NAV] Navigation strategy set to: ${mode}`);
}
