/* eslint-disable prettier/prettier */
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783540610906 implements MigrationInterface {
    name = 'InitSchema1783540610906'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "degree" ("id" SERIAL NOT NULL, "studentName" character varying NOT NULL, "studentId" integer NOT NULL, "title" character varying, "program" character varying NOT NULL, "university" character varying NOT NULL, "graduationYear" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "hash" text, "qrCode" text, "pdf" text, "marksheet" character varying, "isPaid" boolean NOT NULL DEFAULT false, "approvedAt" TIMESTAMP, "transactionHash" character varying, "rawData" text, CONSTRAINT "PK_98a6bfd72670bddb790a13cbca1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'student')`);
        await queryRunner.query(`CREATE TABLE "user" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, "role" "public"."user_role_enum" NOT NULL DEFAULT 'student', CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "degree" ADD CONSTRAINT "FK_d0d1e7a50d52bbb9817c210e64b" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "degree" DROP CONSTRAINT "FK_d0d1e7a50d52bbb9817c210e64b"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
        await queryRunner.query(`DROP TABLE "degree"`);
    }

}
