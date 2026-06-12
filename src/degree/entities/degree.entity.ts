/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';

import { User } from 'src/user/entities/user.entity';
import { DegreeStatus } from 'src/common/enums/degree-status';

@Entity()
export class Degree {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  studentName!: string;

  @Column()
  studentId!: string;

  // 🏛️ Real column for the Degree Title (e.g., "Bachelor of Science")
  @Column({ nullable: true })
  title!: string;

  @Column()
  program!: string;

  @Column()
  university!: string;

  @Column()
  graduationYear!: number;

  @Column({
    default: DegreeStatus.PENDING,
  })
  status!: DegreeStatus;

  @Column({ type: 'text', nullable: true })
  hash!: string | null;

  @Column({ type: 'text', nullable: true })
  qrCode!: string | null;

  @Column({ type: 'text', nullable: true })
  pdf!: string | null;

  @Column({ nullable: true })
  marksheet!: string; 
  
  @Column({ type: 'boolean', default: false })
  isPaid!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ nullable: true })
  transactionHash!: string;

  @Column({ type: 'text', nullable: true })
  rawData!: string | null;

  @ManyToOne(
    () => User,
    (user) => user.degrees,
    { nullable: true },
  )
  student!: User;
}