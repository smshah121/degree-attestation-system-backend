/* eslint-disable prettier/prettier */
import { TypeOrmModule } from '@nestjs/typeorm';  // ← add this import
import { Module } from '@nestjs/common';
import { User } from './user/entities/user.entity';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DegreeModule } from './degree/degree.module';
import { Degree } from './degree/entities/degree.entity';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5433,
      username: 'postgres',
      password: 'SmShah@12345',
      database: 'degree',
      entities: [User, Degree],
      synchronize: true,
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    UserModule,
    AuthModule,
    DegreeModule,
    BlockchainModule
  ],
})
export class AppModule {}