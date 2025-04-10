"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _express = _interopRequireWildcard(require("express"));
var _chargebee = _interopRequireDefault(require("chargebee"));
var _stripe = _interopRequireDefault(require("stripe"));
var _auth = require("../middlewares/auth");
var _user = _interopRequireDefault(require("../models/user"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const router = (0, _express.Router)();
const stripe = new _stripe.default(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16'
});
router.post('/api/signup', _auth.isAuthenticatedUser, async (req, res) => {
  try {
    const {
      email,
      name
    } = req.body;

    // 👉 1️⃣ Check if customer exists in Stripe
    let stripeCustomer = await stripe.customers.list({
      email
    });
    if (stripeCustomer.data.length > 0) {
      stripeCustomer = stripeCustomer.data[0]; // Use existing customer
    } else {
      stripeCustomer = await stripe.customers.create({
        email: email,
        name: name
      });
    }

    // 👉 2️⃣ Check if customer exists in Chargebee
    let chargebeeCustomerResponse = await _chargebee.default.customer.list({
      "email[is]": email
    }).request();
    let chargebeeCustomer;
    if (chargebeeCustomerResponse.list.length > 0) {
      chargebeeCustomer = chargebeeCustomerResponse.list[0].customer;
    } else {
      const newChargebeeCustomer = await _chargebee.default.customer.create({
        email: email,
        first_name: name
      }).request();
      chargebeeCustomer = newChargebeeCustomer.customer;
    }

    // 👉 3️⃣ Return response with existing or new customer IDs
    return res.status(200).json({
      success: true,
      stripe_id: stripeCustomer,
      chargebee_id: chargebeeCustomer.id,
      customer_info: {
        email,
        name
      }
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
router.post('/api/subscription', _auth.isAuthenticatedUser, async (req, res) => {
  const {
    plan_id,
    customer,
    paymentMethodId,
    amount
  } = req.body;
  try {
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.stripe_customer_id
    });
    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id
      },
      email: customer.email
    });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'usd',
      customer: customer.stripe_customer_id,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      receipt_email: customer.email
    });
    const result = await _chargebee.default.subscription.create_with_items(customer.chargebee_id, {
      subscription_items: [{
        item_price_id: plan_id,
        unit_price: amount * 100
      }],
      payment_intent: {
        gateway_account_id: process.env.CHARGEBEE_STRIPE_GATEWAY_ID,
        gw_payment_intent_id: paymentIntent.id
      }
    }).request();
    const user = await _user.default.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    user.trialStartDate = new Date();
    user.trialExpired = false;
    await user.save();
    return res.status(200).json({
      subscriptionId: result.subscription.id
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).send('Subscription creation failed.');
  }
});
router.post('/api/cancel-subscription', _auth.isAuthenticatedUser, async (req, res) => {
  const {
    subscriptionId
  } = req.body;
  try {
    // Cancel the subscription in Chargebee
    const result = await _chargebee.default.subscription.cancel(subscriptionId, {
      end_of_term: true // or use "immediate" to cancel immediately
    }).request();

    // Optionally, you can also cancel the subscription in Stripe if needed
    // const stripeSubscriptionId = result.subscription.gw_subscription_id;
    // await stripe.subscriptions.del(stripeSubscriptionId);

    const user = await _user.default.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    user.trialExpired = true;
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return res.status(500).send('Subscription cancellation failed.');
  }
});
router.post('/api/chargebee-webhook', _express.default.raw({
  type: 'application/json'
}), async (req, res) => {
  const rawBody = req.body;
  try {
    //Bypass signature verification for testing
    const signature = req.headers['chargebee-webhook-signature'];
    const event = _chargebee.default.webhooks.verify(rawBody, signature);
    console.log('Verified event:', event);
    if (event.event_type === 'subscription_created') {
      console.log('Subscription created:', event.content.subscription);
      // You can add more logic here to handle the subscription creation event
    }
    res.status(200).json({
      received: true
    });
  } catch (err) {
    console.error('Webhook processing failed:', err);
    res.status(400).send('Webhook Error');
  }
});
var _default = exports.default = router;
//# sourceMappingURL=subscription.js.map