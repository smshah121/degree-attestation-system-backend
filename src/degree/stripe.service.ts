/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
const Stripe = require('stripe');

@Injectable()
export class StripeService {
  public stripe

  constructor() {
   
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('Stripe secret key missing!');
    }
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  
  }


  async createCheckoutSession(degreeId: number, studentEmail: string) {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'pkr', 
            product_data: {
              name: 'Official Degree Attestation & Verification Processing Fee',
              description: `Automated AI OCR analysis validation assessment registry costs for Case ID: #${degreeId}`,
            },
            unit_amount: 150000,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: studentEmail,

      success_url: `http://localhost:5173/student-dashboard?payment=success&id=${degreeId}`,
      cancel_url: `http://localhost:5173/student-dashboard?payment=cancelled`,
      metadata: {
        degreeId: String(degreeId), 
      },
    });

    return { url: session.url };
  }
}