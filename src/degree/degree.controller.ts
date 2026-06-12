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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DegreeService } from './degree.service';
import { CreateDegreeDto } from './dto/create-degree.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-guard';
import { RolesGuard } from 'src/common/guards/role-guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { UserRole } from 'src/common/enums/user-role';
import { Public } from 'src/common/decorators/public-decorator';

const pdfStorage = diskStorage({
  destination: './uploads/degrees/pdf',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `degree-${uniqueSuffix}${extname(file.originalname)}`);
  },
});


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
      storage: pdfStorage,
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'), false);
        }
      },
    }),
  )
  uploadPdf(
    @Param('degreeId', ParseIntPipe) degreeId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.degreeService.uploadPdf(degreeId, file.path);
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
     
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          cb(null, true);
        } else {
          cb(new Error('Only JPG, JPEG, and PNG image formats are supported by the AI engine! ❌'), false);
        }
      },
    }),
  )
  async uploadTranscriptOcr(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    
    const relativePath = `uploads/degrees/marksheets/transcript-${id}-${Date.now()}-${file.originalname}`;
    
   
    return await this.degreeService.uploadStudentTranscriptWithOcr(
      id,
      file.buffer,
      relativePath,
      req.user.id,
    );
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