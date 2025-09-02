import express, { Router } from 'express';
import chargebee from 'chargebee';
import Stripe from 'stripe';
import { isAuthenticatedUser } from '../middlewares/auth.js';
import User from "../models/user.js"

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16',
});

router.post('/api/signup', isAuthenticatedUser, async (req, res) => {
  try {
    const { email, name } = req.body;
   console.log("0");
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
    console.log("1");
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
    console.log("2");
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
      user.isSubscribed = true;
  
      await user.save();

    return res
      .status(200)
      .json({ subscriptionId: result.subscription.id });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).send('Subscription creation failed.');
  }
});

router.post('/api/cancel-subscription', isAuthenticatedUser, async (req, res) => {
  const { subscriptionId } = req.body;

  try {
    // Cancel the subscription in Chargebee
    const result = await chargebee.subscription.cancel(subscriptionId, {
      end_of_term: true // or use "immediate" to cancel immediately
    }).request();

    // Optionally, you can also cancel the subscription in Stripe if needed
    // const stripeSubscriptionId = result.subscription.gw_subscription_id;
    // await stripe.subscriptions.del(stripeSubscriptionId);

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.trialExpired = true; 
    await user.save();

    return res.status(200).json({ success: true, message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return res.status(500).send('Subscription cancellation failed.');
  }
});


router.post(
  '/api/chargebee-webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body;
    const signature = req.headers['chargebee-webhook-signature'];

    if (!signature) {
      console.error('No webhook signature found');
      return res.status(400).json({ error: 'No webhook signature found' });
    }

    try {
      const event = chargebee.webhooks.verify(rawBody, signature);
      console.log('Verified event:', event);

      if (event.event_type === 'subscription_created') {
        console.log('Subscription created:', event.content.subscription);
        // Update user subscription status
        const customer = event.content.customer;
        const user = await User.findOne({ email: customer.email });
        
        if (user) {
          user.isSubscribed = true;
          user.trialExpired = true;
          await user.save();
          console.log('Updated user subscription status:', user.email);
        }
      } else if (event.event_type === 'payment_intent.succeeded') {
        console.log('Payment succeeded:', event.content.payment_intent);
        
        // Get the customer and subscription details from the payment intent
        const paymentIntent = event.content.payment_intent;
        const customer = await stripe.customers.retrieve(paymentIntent.customer);
        
        // Find the user
        const user = await User.findOne({ email: customer.email });
        
        if (user) {
          // Create subscription in Chargebee
          const subscription = await chargebee.subscription
            .create_with_items(customer.id, {
              subscription_items: [
                {
                  item_price_id: paymentIntent.metadata.plan_id,
                  unit_price: paymentIntent.amount,
                },
              ],
              payment_intent: {
                gateway_account_id: process.env.CHARGEBEE_STRIPE_GATEWAY_ID,
                gw_payment_intent_id: paymentIntent.id,
              },
            })
            .request();

          // Update user status
          user.isSubscribed = true;
          user.trialExpired = true;
          await user.save();
          
          console.log('Created subscription and updated user status:', user.email);
        }
      }

      // Always return 200 for successful webhook processing
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook processing failed:', err);
      return res.status(400).json({ error: 'Webhook Error' });
    }
  }
);

export default router;
