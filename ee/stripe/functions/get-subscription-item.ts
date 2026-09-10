import { stripeInstance } from "..";

export interface SubscriptionDiscount {
  couponId: string;
  percentOff?: number;
  amountOff?: number;
  duration: string;
  durationInMonths?: number;
  valid: boolean;
  end?: number;
}

export default async function getSubscriptionItem(
  subscriptionId: string,
  isOldAccount: boolean,
) {
  const stripe = stripeInstance(isOldAccount);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["discount.coupon"],
  });
  const subscriptionItem = subscription.items.data[0];

  // Extract discount information if available. Stripe moved this from a
  // single subscription.discount object to a subscription.discounts array
  // (accounts can now have more than one) - we only ever apply one discount
  // (the pause-plan coupon), so just look at the first entry. Stripe also
  // moved the coupon itself off the discount object directly onto
  // discount.source.coupon (source distinguishes a coupon-based discount
  // from other discount types Stripe may add later).
  let discount: SubscriptionDiscount | null = null;
  const firstDiscount = subscription.discounts?.[0];
  if (firstDiscount && typeof firstDiscount !== "string") {
    const couponSource = firstDiscount.source.coupon;
    if (couponSource && typeof couponSource !== "string") {
      const coupon = couponSource;
      discount = {
        couponId: coupon.id,
        percentOff: coupon.percent_off || undefined,
        amountOff: coupon.amount_off || undefined,
        duration: coupon.duration,
        durationInMonths: coupon.duration_in_months || undefined,
        valid: coupon.valid,
        end: firstDiscount.end || undefined,
      };
    }
  }

  return {
    id: subscriptionItem.id,
    currentPeriodStart: subscriptionItem.current_period_start,
    currentPeriodEnd: subscriptionItem.current_period_end,
    discount,
  };
}
