/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
const Stripe = require('stripe');

@Injectable()
export class StripeService {
  public stripe

  constructor() {
    // Initializes Stripe with your secure private secret token key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('Stripe secret key missing!');
    }
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  
  }

  /**
   * Provisions a secure checkout screen URL session token for a targeted degree record
   */
  async createCheckoutSession(degreeId: number, studentEmail: string) {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'pkr', // Charged in Pakistani Rupees
            product_data: {
              name: 'Official Degree Attestation & Verification Processing Fee',
              description: `Automated AI OCR analysis validation assessment registry costs for Case ID: #${degreeId}`,
            },
            unit_amount: 150000, // 1,500.00 PKR (Stripe reads input metrics inside minimum denomination paisas)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: studentEmail,
      // Where to bounce the browser interface view once processing completes or cancels
      success_url: `http://localhost:5173/student-dashboard?payment=success&id=${degreeId}`,
      cancel_url: `http://localhost:5173/student-dashboard?payment=cancelled`,
      metadata: {
        degreeId: String(degreeId), // 🎯 Essential: Stores the key connection link for tracking incoming webhook responses
      },
    });

    return { url: session.url };
  }
}