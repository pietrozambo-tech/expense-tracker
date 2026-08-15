// The budget card's per-day allowance, and the question of whether it is worth
// printing at all.
//
// Lives here rather than inline in BudgetBar because it is a rule with two
// edges, and both of them are the sort of thing that only shows up on the 29th
// of a month nobody is testing on.

/**
 * What the remaining budget allows per day - or null when saying so would be
 * useless.
 *
 * Floored, never rounded: a figure introduced by "up to" must not overshoot
 * the budget it is derived from.
 *
 * The band it has to fall inside is the whole point. Below a tenth of the
 * budget's own daily pace, "up to 1EUR a day" is arithmetic wearing a straight
 * face. Above twice that pace it fails in the opposite direction and is easier
 * to miss: three days left with 690 to go prints "up to 230EUR a day" at
 * somebody whose 3,200 budget implies 103: not a limit they were ever going to
 * reach, just the card egging them on. Both ends produce a number that is true
 * and useless, and the status chip beside it already says how the month is
 * going.
 *
 * The yardstick is the budget's own flat pace, and deliberately not the
 * caller's `usualByNow`. That figure is cumulative-to-today, so dividing it by
 * the days elapsed measures WHEN a household's fixed costs land rather than
 * what an ordinary day costs - rent on the 1st reads as 470/day in week one,
 * the same rent on the 28th as 30/day. It is the right signal for "are you
 * ahead of your own pace", which is what BudgetBar already uses it for, and
 * the wrong one for "what is a lot for you in a day".
 */
export function dailyAllowance(
  spent: number,
  budget: number,
  daysLeft: number,
  /** 0-1 share of the month elapsed, used only to recover its length. */
  monthProgress: number,
): number | null {
  if (!(budget > 0) || spent > budget || daysLeft < 1) return null;
  const allowance = Math.floor((budget - spent) / daysLeft);
  // The month's length, back out of the share of it that is left. Guarded
  // because a monthProgress of exactly 1 would divide by zero, and an infinite
  // month makes the pace zero - which fails closed, hiding the line.
  const daysInMonth = Math.max(1, Math.round(daysLeft / (1 - monthProgress)));
  const pace = budget / daysInMonth;
  if (allowance < pace * 0.1 || allowance > pace * 2) return null;
  return allowance;
}
