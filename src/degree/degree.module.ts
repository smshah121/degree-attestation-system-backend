/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { DegreeService } from './degree.service';
import { DegreeController } from './degree.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Degree } from './entities/degree.entity';
import { User } from 'src/user/entities/user.entity';
import { BlockchainModule } from 'src/blockchain/blockchain.module';
import { OcrService } from './ocr.service';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Degree,User]),
    BlockchainModule
  ],
  controllers: [DegreeController,StripeController],
  providers: [DegreeService,OcrService, StripeService],
})
export class DegreeModule {}
