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

// const imageStorage = diskStorage({
//   destination: './uploads/degrees/marksheets',
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     cb(null, `marksheet-${uniqueSuffix}${extname(file.originalname)}`);
//   },
// });

@Controller('degrees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DegreeController {
  constructor(private readonly degreeService: DegreeService) {}

  // ── STUDENT — submit degree request ────────
  @Post()
  @Roles(UserRole.STUDENT)                    // ← fixed from ADMIN to STUDENT
  createDegree(
    @Body() dto: CreateDegreeDto,
    @Request() req: any,
  ) {
    return this.degreeService.createDegree(dto, req.user.id); // ← from JWT not URL
  }

  // ── ADMIN — upload PDF ──────────────────────
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

  // // ── STUDENT — upload marksheet ──────────────
  // @Post(':degreeId/upload-marksheet')
  // @Roles(UserRole.STUDENT)
  // @UseInterceptors(
  //   FileInterceptor('marksheet', {
  //     storage: imageStorage,
  //     fileFilter: (req, file, cb) => {
  //       if (file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
  //         cb(null, true);
  //       } else {
  //         cb(new Error('Only JPG/PNG images are allowed'), false);
  //       }
  //     },
  //   }),
  // )
  // uploadMarksheet(
  //   @Param('degreeId', ParseIntPipe) degreeId: number,
  //   @UploadedFile() file: Express.Multer.File,
  //   @Request() req: any,
  // ) {
  //   return this.degreeService.uploadMarksheet(degreeId, file.path, req.user.id);
  // }

  // ── ADMIN — approve ─────────────────────────
  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  approveDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.approveDegree(id);
  }

  // ── ADMIN — reject ──────────────────────────
  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  rejectDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.rejectDegree(id);
  }

  // ── ADMIN — dashboard stats ─────────────────
  // ⚠️ static routes MUST come before :id routes
  @Get('dashboard/stats')
  @Roles(UserRole.ADMIN)
  getDashboardStats() {
    return this.degreeService.getDashboardStats();
  }

  // ── ADMIN — audit log ───────────────────────
  @Get('audit/log')
  @Roles(UserRole.ADMIN)
  getAuditLog() {
    return this.degreeService.getAuditLog();
  }

  // ── ADMIN — report ──────────────────────────
  @Get('report/summary')
  @Roles(UserRole.ADMIN)
  getReport() {
    return this.degreeService.getReport();
  }

  // ── ADMIN — pending degrees ─────────────────
  @Get('pending')
  @Roles(UserRole.ADMIN)
  findPending() {
    return this.degreeService.findPending();
  }

  // ── PUBLIC — verify by hash (QR scan) ───────
  // no guard — anyone can verify
  @Get('verify/:hash')
  @Public()
  verifyByHash(@Param('hash') hash: string) {
    return this.degreeService.verifyByHash(hash);
  }

 // ── STUDENT — upload transcript with real-time AI OCR scanning evaluation ───
  @Post(':id/upload-transcript-ocr')
  @Roles(UserRole.STUDENT) // Uses your global RolesGuard to verify the user is a student
  @UseInterceptors(
    FileInterceptor('file', {
      // ✅ Security Check: Restricts file uploads to raw image files only so Tesseract won't crash
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
    @UploadedFile() file: Express.Multer.File, // Grab the Multer file stream details safely
    @Request() req: any,
  ) {
    // 📂 Define where the transcript path index will track inside your system directories
    const relativePath = `uploads/degrees/marksheets/transcript-${id}-${Date.now()}-${file.originalname}`;
    
    // Pass the degreeId, raw file buffer memory context, destination path string, and student user account ID
    return await this.degreeService.uploadStudentTranscriptWithOcr(
      id,
      file.buffer, // Tesseract needs this buffer directly out of RAM memory for fast computing
      relativePath,
      req.user.id,
    );
  }
  // ── STUDENT — get own degrees ────────────────
  @Get('my-degrees')
  @Roles(UserRole.STUDENT)
  findMyDegrees(@Request() req: any) {
    return this.degreeService.findMyDegrees(req.user.id);
  }

  // ── ADMIN — get all degrees ──────────────────
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.degreeService.findAll();
  }

  // ── BOTH — get single degree ─────────────────
  // ⚠️ :id route MUST come after all static routes
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.degreeService.findOne(id, isAdmin); // ← fixed: only 2 args
  }

  // ── ADMIN — delete degree ────────────────────
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteDegree(@Param('id', ParseIntPipe) id: number) {
    return this.degreeService.deleteDegree(id);
  }
}