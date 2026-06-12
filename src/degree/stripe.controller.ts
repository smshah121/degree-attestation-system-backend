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
    @InjectRepository(Degree) 
    private readonly degreeRepo: Repository<Degree>,
  ) {}


  @UseGuards(JwtAuthGuard)
  @Post('checkout/:degreeId')
  async createCheckout(
    @Param('degreeId') degreeId: number,
    @Request() req: any,
  ) {
    return await this.stripeService.createCheckoutSession(Number(degreeId), req.user.email);
  }

 
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
     
      event = this.stripeService.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(`❌ [STRIPE CRITICAL ERROR] Signature validation matching mismatched: ${err.message}`);
      return res.status(400).send(`Webhook Signature Authentication Refused: ${err.message}`);
    }

   
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      const degreeId = Number(session.metadata?.degreeId);

      console.log(`💳 [STRIPE SYSTEM LOG] Invoice settled for Attestation Case Reference: #${degreeId}!`);

      if (degreeId) {
      
        const degree = await this.degreeRepo.findOne({ where: { id: degreeId } });
        
        if (degree) {
          degree.isPaid = true;
          await this.degreeRepo.save(degree);
          console.log(`✅ [DATABASE UPDATED] Case Record Index #${degreeId} is marked as PAID.`);
        } else {
          console.warn(`⚠️ [DATABASE ERROR] Webhook arrived for Case ID #${degreeId}, but row entry was missing.`);
        }
      }
    }

  
    return res.status(200).json({ received: true });
  }
}