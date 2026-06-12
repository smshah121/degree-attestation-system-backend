/* eslint-disable prettier/prettier */
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DegreeStatus } from 'src/common/enums/degree-status';

export class UpdateDegreeDto {
  @IsOptional()
  @IsString()
  issuedDate?: string;

  @IsOptional()
  @IsString()
  hash?: string;

  @IsOptional()
  @IsString()
  certificateUrl?: string;

  @IsOptional()
  @IsEnum(DegreeStatus)
  status?: DegreeStatus;
}