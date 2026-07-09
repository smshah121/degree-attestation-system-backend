/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { memoryStorage } from 'multer';

import { DegreeService } from './degree.service';
import { CreateDegreeDto } from './dto/create-degree.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-guard';
import { RolesGuard } from 'src/common/guards/role-guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { UserRole } from 'src/common/enums/user-role';
import { Public } from 'src/common/decorators/public-decorator';

@Controller('degrees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DegreeController {
  constructor(private readonly degreeService: DegreeService) {}

  @Post()
  @Roles(UserRole.STUDENT)                    
  createDegree(
    @Body() dto: CreateDegreeDto,
    @Request() req: any,
  ) {
    return this.degreeService.createDegree(dto, req.user.id); 
  }

  @Post(':degreeId/upload-pdf')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('pdf', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
        }
      },
    }),
  )
  async uploadPdf(
    @Param('degreeId', ParseIntPipe) degreeId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No PDF file uploaded.');
    }
    return await this.degreeService.uploadPdf(degreeId, file);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  approveDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.approveDegree(id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  rejectDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.rejectDegree(id);
  }

  @Get('dashboard/stats')
  @Roles(UserRole.ADMIN)
  getDashboardStats() {
    return this.degreeService.getDashboardStats();
  }

  @Get('audit/log')
  @Roles(UserRole.ADMIN)
  getAuditLog() {
    return this.degreeService.getAuditLog();
  }

  @Get('report/summary')
  @Roles(UserRole.ADMIN)
  getReport() {
    return this.degreeService.getReport();
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  findPending() {
    return this.degreeService.findPending();
  }
 
  @Get('verify/:hash')
  @Public()
  verifyByHash(@Param('hash') hash: string) {
    return this.degreeService.verifyByHash(hash);
  }

  @Post(':id/upload-transcript-ocr')
  @Roles(UserRole.STUDENT)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPG, JPEG, and PNG image formats are supported by the AI engine! ❌',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadTranscriptOcr(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No transcript file uploaded.');
    }

    try {
      return await this.degreeService.uploadStudentTranscriptWithOcr(
        id,
        file.buffer,
        file,
        req.user.id,
      );
    } catch (error: any) {
      console.error(
        '❌ [OCR ERROR LOGGED IN TERMINAL]:',
        error?.message || error,
      );

      const errorMessage =
        error?.response?.message ||
        error?.message ||
        'Transcript OCR identity matching validation failed.';

      throw new BadRequestException({
        statusCode: 400,
        message: errorMessage,
        error: 'Bad Request',
      });
    }
  }
  
  @Get('my-degrees')
  @Roles(UserRole.STUDENT)
  findMyDegrees(@Request() req: any) {
    return this.degreeService.findMyDegrees(req.user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.degreeService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.degreeService.findOne(id, isAdmin); 
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.deleteDegree(id);
  }
}