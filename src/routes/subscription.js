import express, { Router } from 'express';
import chargebee from 'chargebee';
import Stripe from 'stripe';
import { isAuthenticatedUser } from '../middlewares/auth';
import User from "../models/user"

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16',
});

router.post('/api/signup', isAuthenticatedUser, async (req, res) => {
  try {
    const { email, name } = req.body;

    // 👉 1️⃣ Check if customer exists in Stripe
    let stripeCustomer = await stripe.customers.list({ email });
    if (stripeCustomer.data.length > 0) {
      stripeCustomer = stripeCustomer.data[0]; // Use existing customer
    } else {
      stripeCustomer = await stripe.customers.create({
        email: email,
        name: name,
      });
    }

    // 👉 2️⃣ Check if customer exists in Chargebee
    let chargebeeCustomerResponse = await chargebee.customer.list({ "email[is]": email }).request();
    let chargebeeCustomer;

    if (chargebeeCustomerResponse.list.length > 0) {
      chargebeeCustomer = chargebeeCustomerResponse.list[0].customer;
    } else {
      const newChargebeeCustomer = await chargebee.customer.create({
        email: email,
        first_name: name,
      }).request();
      chargebeeCustomer = newChargebeeCustomer.customer;
    }

    // 👉 3️⃣ Return response with existing or new customer IDs
    return res.status(200).json({
      success: true,
      stripe_id: stripeCustomer,
      chargebee_id: chargebeeCustomer.id,
      customer_info: { email, name }
    });

  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});


router.post('/api/subscription', isAuthenticatedUser, async (req, res) => {
  const { plan_id, customer, paymentMethodId, amount } = req.body;

  try {
    const paymentMethod = await stripe.paymentMethods.attach(
      paymentMethodId,
      {
        customer: customer.stripe_customer_id,
      },
    );

    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
      email: customer.email,
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

    const result = await chargebee.subscription
      .create_with_items(customer.chargebee_id, {
        subscription_items: [
          {
            item_price_id: plan_id,
            unit_price: amount * 100,
          },
        ],
        payment_intent: {
          gateway_account_id: process.env.CHARGEBEE_STRIPE_GATEWAY_ID,
          gw_payment_intent_id: paymentIntent.id,
        },
      })
      .request();

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      user.trialStartDate = new Date();
      user.trialExpired = true;
  
      await user.save();

    return res
      .status(200)
      .json({ subscriptionId: result.subscription.id });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).send('Subscription creation failed.');
  }
});


router.post(
  '/api/chargebee-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['chargebee-webhook-signature'];
    const body = req.body;

    try {
      const event = chargebee.webhooks.verify(body, signature);

      if (event.event_type === 'subscription_created') {
        console.log(
          'Subscription created:',
          event.content.subscription,
        );
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      res.status(400).send('Webhook Error');
    }
  },
);

export default router;
