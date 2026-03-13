import Stripe from 'stripe';
import config from '../config';

if (!config.stripe.stripe_api_secret) {
  throw new Error('STRIPE_API_SECRET is not defined in environment variables');
}

const stripe = new Stripe(config.stripe.stripe_api_secret as string);

export default stripe;
