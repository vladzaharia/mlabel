/**
 * Whether the app may check for updates.
 *
 * One expression of one rule, with one call site — which is the entire point.
 * A config setting `network.updateChecks: false` is an **absolute floor**: the
 * app must make no network request at all, and no preference a labeler can set
 * may lift that. The user setting can only ever narrow further.
 *
 * Trivial by construction. Its value is that the floor is stated once, tested
 * once, and cannot be re-derived slightly differently somewhere else.
 */
export function effectiveUpdateChecks(configAllows: boolean, userAllows: boolean): boolean {
  return configAllows && userAllows;
}
