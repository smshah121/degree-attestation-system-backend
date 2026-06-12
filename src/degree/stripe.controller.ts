/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
import { Controller, Post, Param, UseGuards, Request, Headers, Req, Res, BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm'; // 🎯 FIX 1: Imported InjectRepository
import { Degree } from '../degree/entities/degree.entity'; 
import { Response, Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-guard'; 
import { Public } from '../common/decorators/public-decorator'; 

@Controller('payment')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    @InjectRepository(Degree) // 🎯 FIX 1: Added the decorator to inject your table schema context properly
    private readonly degreeRepo: Repository<Degree>,
  ) {}

  // ────────────────────────────────────────────────────────
  // AUTHENTICATED GATE: Student triggers creation of payment URL
  // ────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('checkout/:degreeId')
  async createCheckout(
    @Param('degreeId') degreeId: number,
    @Request() req: any,
  ) {
    return await this.stripeService.createCheckoutSession(Number(degreeId), req.user.email);
  }

  // ────────────────────────────────────────────────────────
  // PUBLIC STREAM WEBHOOK: Acknowledges verification signals sent from Stripe Cloud
  // ────────────────────────────────────────────────────────
  @Public() 
  @Post('webhook')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: ExpressRequest,
    @Res() res: Response,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing secure stripe cryptographic payload signature header.');
    }

    const rawBody = (req as any).rawBody;

    let event: any;
    try {
      // 🎯 FIX 2: Re-use the existing initialized stripe instance from your StripeService instead of creating a new one
      event = this.stripeService.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(`❌ [STRIPE CRITICAL ERROR] Signature validation matching mismatched: ${err.message}`);
      return res.status(400).send(`Webhook Signature Authentication Refused: ${err.message}`);
    }

    // 🎯 Catch the designated charge clearance transaction invoice code type on the wire
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      const degreeId = Number(session.metadata?.degreeId);

      console.log(`💳 [STRIPE SYSTEM LOG] Invoice settled for Attestation Case Reference: #${degreeId}!`);

      if (degreeId) {
        // Query database entity tracking row 
        const degree = await this.degreeRepo.findOne({ where: { id: degreeId } });
        
        if (degree) {
          degree.isPaid = true; // 🔓 Flips structural flag column to TRUE to unlock file input elements globally!
          await this.degreeRepo.save(degree);
          console.log(`✅ [DATABASE UPDATED] Case Record Index #${degreeId} is marked as PAID.`);
        } else {
          console.warn(`⚠️ [DATABASE ERROR] Webhook arrived for Case ID #${degreeId}, but row entry was missing.`);
        }
      }
    }

    // 🏁 Always answer back to Stripe instantly with a 200 JSON payload to block retry delivery storms
    return res.status(200).json({ received: true });
  }
}