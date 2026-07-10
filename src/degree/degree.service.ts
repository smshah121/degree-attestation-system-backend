/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Degree } from "./entities/degree.entity";
import { User } from "src/user/entities/user.entity";
import { CreateDegreeDto } from "./dto/create-degree.dto";
import { DegreeStatus } from "src/common/enums/degree-status";
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { BlockchainService } from "src/blockchain/blockchain.service";
import { OcrService } from "./ocr.service";
import PDFDocument = require('pdfkit');

import * as streamifier from 'streamifier';
import cloudinary from 'src/common/cloudinary/cloudinary.config';

@Injectable()
export class DegreeService {
  constructor(
    @InjectRepository(Degree)
    private degreeRepo: Repository<Degree>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private readonly blockchainService: BlockchainService,
    private readonly ocrService: OcrService, 
  ) {}

  async createDegree(dto: CreateDegreeDto, userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.degreeRepo.findOne({
      where: { 
        student: { id: userId }, 
        status: DegreeStatus.PENDING,
      }
    });
    if (existing) throw new ForbiddenException('Degree already exists for this student ID');

    const degree = this.degreeRepo.create({
      ...dto,
      student: user,
      studentId: dto.studentId || String(user.id),
      studentName: dto.studentName || user.name,
      status: DegreeStatus.PENDING,
    });
    return this.degreeRepo.save(degree);
  }

  
  async uploadStudentTranscriptWithOcr(
    degreeId: number, 
    buffer: Buffer, 
    file: Express.Multer.File, 
    userId: number
  ) {
    const degree = await this.degreeRepo.findOne({
      where: { id: degreeId },
      relations: { student: true },
    });

    if (!degree) throw new NotFoundException('Degree record not found');

    if (degree.student.id !== userId) {
      throw new ForbiddenException('You can only upload a transcript to your own degree profile');
    }

    console.log('======================');
console.log(cloudinary.config());
console.log('======================');

    // 1. Upload Marksheet Image to Cloudinary first
    const marksheetUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'degree' },
        (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url) return reject(new Error('Cloudinary upload failed'));
          resolve(result.secure_url);
        }
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });

    degree.marksheet = marksheetUrl;

    // 2. Extract and Process OCR
    const scrapedText = await this.ocrService.extractText(buffer);

    console.log('================= AI OCR RAW EXTRACTED TEXT =================');
    console.log(scrapedText || '[EMPTY TEXT EXTRACTED - IMAGE MIGHT BE BLURRY]');
    console.log('=============================================================');

    // 3. Verify Identity Matching
    const isNameVerified = this.ocrService.verifyMatch(scrapedText, degree.studentName);

    if (!isNameVerified) {
      console.warn(`[OCR WARNING] Name mismatch detected for Case #${degreeId}. Dropped to manual review.`);
      degree.status = DegreeStatus.PENDING;
      await this.degreeRepo.save(degree);
      return {
        status: 'PENDING',
        message: 'Transcript saved successfully. Identity alignment mismatch flags raised for manual administration review.',
      };
    }

    // 4. Validate Academic Metrics
    const gpaValidationResult = this.ocrService.validateGpaMetric(scrapedText);

    if (gpaValidationResult === 'REJECTED') {
      console.warn(`[AUTO-REJECT] Case #${degreeId} dropped below academic standards (< 2.5).`);
      degree.status = DegreeStatus.REJECTED;
      const rejectedDegree = await this.degreeRepo.save(degree);
      return {
        status: 'REJECTED',
        message: 'Application declined automatically. Uploaded transcript GPA falls below the minimum required 2.5 CGPA standard. ❌',
        reason: 'Transcript CGPA falls below the minimum required 2.5 standard baseline. ❌',
        degree: {
          ...rejectedDegree,
          marksheetPath: rejectedDegree.marksheet,
          pdfPath: rejectedDegree.pdf,
        },
      };
    }

    if (gpaValidationResult === 'UNREADABLE') {
      console.warn(`[OCR WARNING] GPA metrics unreadable for Case #${degreeId}. Routing to admin desks.`);
      degree.status = DegreeStatus.PENDING;
      await this.degreeRepo.save(degree);
      return {
        status: 'PENDING',
        message: 'Transcript saved. GPA notation fields unreadable by AI engine. Forwarded for manual evaluation.',
      };
    }

    // 5. Run Auto Approval Pipeline
    console.log(`[AUTO-APPROVAL SUCCESS] OCR verified Case #${degreeId}. Running smart contract deployment tasks...`);
    const approvedDegree = await this.approveDegree(degreeId);

    return {
      status: 'APPROVED',
      message: 'AI Evaluation processing complete. Transcript passed identity and GPA requirements. Certificate generated and anchored safely to the ledger! ✅',
      degree: approvedDegree,
    };
  }

  async approveDegree(id: number) {
    
    const degree = await this.degreeRepo.findOne({
      where: { id },
      relations: { student: true },
    });
    if (!degree) throw new NotFoundException('Degree not found');

    const rawData = JSON.stringify({
      studentName: degree.studentName,
      studentId: String(degree.studentId),
      title: degree.title || 'Bachelor of Science', 
      program: degree.program,
      university: degree.university,
      graduationYear: degree.graduationYear,
    }, ['studentName', 'studentId', 'title', 'program', 'university', 'graduationYear']);

    const hash = crypto.createHash('sha256').update(rawData).digest('hex');
    const qrCodeDataUrl = await QRCode.toDataURL(hash);
    console.log("===== APPROVE DEGREE =====");
console.log("Degree ID:", degree.id);
console.log("Student ID:", degree.studentId);
console.log("Status:", degree.status);
console.log("Hash:", hash);
    // Anchor securely on-chain
    let txHash: string;
    try {
      txHash = await this.blockchainService.storeDegree(
        String(degree.studentId).trim(),
        String(hash)
      );
    } catch (blockchainError) {
      console.error('[BLOCKCHAIN] Transaction reverted:', blockchainError);
      throw new InternalServerErrorException('Blockchain anchoring transaction failed.');
    }
    console.log("Degree ID:", degree.id);
console.log("Student ID:", degree.studentId);
console.log("Status:", degree.status);
console.log("Hash:", hash);

    // Build PDF Certificate dynamically in-memory
    const pdfUrl = await new Promise<string>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
      
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        
        // Stream the memory buffer safely up to Cloudinary
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'degree', 
            resource_type: 'raw' ,
            public_id: `certificate-${degree.id}.pdf`,
            format: "pdf",
            overwrite: true,
          },
          (error, result) => {
            console.log("========== CLOUDINARY RESULT ==========");
  console.log(result);
  console.log("=======================================");
            if (error) return reject(error);
            if (!result?.secure_url) return reject(new Error('Cloudinary Certificate upload failed'));
            resolve(result.secure_url);
          }
        );
        streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
      });
      doc.on('error', (err) => reject(err));

      // Visual Design Construction
      doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(3).stroke('#0f172a');
      doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(1).stroke('#0d9488');

      doc.moveDown(2);
      doc.fillColor('#0f172a').fontSize(28).font('Helvetica-Bold').text(String(degree.university || 'UNIVERSITY').toUpperCase(), { align: 'center' });
      doc.fillColor('#0d9488').fontSize(12).font('Helvetica').text('SECURE DEGREE VERIFICATION ATTESTATION STANDARDS', { align: 'center', characterSpacing: 2 });
      
      doc.moveDown(2);
      doc.fillColor('#475569').fontSize(16).font('Helvetica-Oblique').text('This document formally validates that', { align: 'center' });
      
      doc.moveDown(1);
      doc.fillColor('#0f172a').fontSize(24).font('Helvetica-Bold').text(degree.studentName || 'Honored Graduate', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fillColor('#475569').fontSize(14).font('Helvetica').text(`Bearing Registered Matrix Student Identification Key: ${degree.studentId || id}`, { align: 'center' });
      
      doc.moveDown(1.5);
      doc.fillColor('#475569').fontSize(14).text('has successfully met all academic criteria set forth by boards for the completion of', { align: 'center' });
      
      const verifiedTitle = degree.title || 'Bachelor of Science';
      const verifiedProgram = degree.program || 'Software Engineering';

      doc.moveDown(1);
      doc.fillColor('#0d9488').fontSize(20).font('Helvetica-Bold').text(`${verifiedTitle} in ${verifiedProgram}`, { align: 'center' });
      doc.fillColor('#475569').fontSize(14).font('Helvetica').text(`Conferred within the graduation timeline cohort of ${degree.graduationYear || new Date().getFullYear()}`, { align: 'center' });

      doc.image(qrCodeDataUrl, doc.page.width / 2 - 50, doc.page.height - 165, { width: 100, height: 100 });

      doc.fillColor('#94a3b8').fontSize(8).font('Courier').text(`SECURE SHA256 BLOCK HASH: ${hash}`, 40, doc.page.height - 55, { align: 'center', width: doc.page.width - 80 });
      doc.text(`LEDGER TRANSACTION SIGNATURE REFERENCE: ${txHash}`, 40, doc.page.height - 43, { align: 'center', width: doc.page.width - 80 });

      doc.end();
    });

    degree.rawData = rawData;   
    degree.hash = hash;
    degree.qrCode = qrCodeDataUrl;
    degree.status = DegreeStatus.APPROVED;
    degree.transactionHash = txHash;
    degree.pdf = pdfUrl; 
    degree.approvedAt = new Date();

    const updated = await this.degreeRepo.save(degree);
    return { ...updated, marksheetPath: updated.marksheet, pdfPath: updated.pdf };
  }

  async rejectDegree(id: number) {
    const degree = await this.degreeRepo.findOneBy({ id });
    if (!degree) throw new NotFoundException('Degree not found');

    degree.status = DegreeStatus.REJECTED;
    const updated = await this.degreeRepo.save(degree);
    return { ...updated, marksheetPath: updated.marksheet, pdfPath: updated.pdf };
  }

  async uploadPdf(degreeId: number, file: Express.Multer.File) {
    const degree = await this.degreeRepo.findOneBy({ id: degreeId });
    if (!degree) throw new NotFoundException('Degree not found');

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'degree', resource_type: 'raw' },
        async (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url) return reject(new Error('Cloudinary PDF upload failed'));

          degree.pdf = result.secure_url;
          const updatedDegree = await this.degreeRepo.save(degree);
          resolve({ ...updatedDegree, pdfPath: updatedDegree.pdf });
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async findAll() {
    const records = await this.degreeRepo.find({
      relations: { student: true },
      order: { id: 'DESC' },
    });
    return records.map(d => ({ ...d, marksheetPath: d.marksheet, pdfPath: d.pdf }));
  }

  async findPending() {
    const records = await this.degreeRepo.find({
      where: { status: DegreeStatus.PENDING },
      relations: { student: true },
      order: { id: 'DESC' },
    });
    return records.map(d => ({ ...d, marksheetPath: d.marksheet, pdfPath: d.pdf }));
  }

  async findOne(id: number, isAdmin?: boolean) {
    const degree = await this.degreeRepo.findOne({
      where: { id },
      relations: { student: true },
    });
    if (!degree) throw new NotFoundException('Degree not found');

    if (!isAdmin && degree.status !== DegreeStatus.APPROVED) {
      degree.hash = null;
      degree.qrCode = null;
      degree.pdf = null;
    }
    return { ...degree, marksheetPath: degree.marksheet, pdfPath: degree.pdf };
  }

  async findMyDegrees(userId: number) {
    const degrees = await this.degreeRepo.find({
      where: { student: { id: userId } },
      relations: { student: true },
      order: { id: 'DESC' },
    });

    return degrees.map((d) => {
      if (d.status !== DegreeStatus.APPROVED) {
        d.hash = null;
        d.qrCode = null;
        d.pdf = null;
      }
      return { ...d, marksheetPath: d.marksheet, pdfPath: d.pdf };
    });
  }

  async verifyByHash(hash: string) {
    const degree = await this.degreeRepo.findOne({
      where: { hash },
      relations: { student: true },
    });

    if (!degree) {
      return { valid: false, message: 'Invalid degree — hash not found ❌' };
    }

    if (degree.status !== DegreeStatus.APPROVED) {
      return { valid: false, message: 'Degree is not approved ❌' };
    }

    const cleanStudentId = String(degree.studentId).trim();

    try {
      const onChain = await this.blockchainService.verifyDegree(cleanStudentId);
      if (!onChain) return { valid: false, message: 'Not found on blockchain ❌' };

      const chainData = await this.blockchainService.getDegree(cleanStudentId);
      const storedData = JSON.parse(degree.rawData!);

      return {
        valid: true,
        message: 'Degree is valid ✅',
        verifiedOn: { database: true, blockchain: true },
        blockchainProof: {
          transactionHash: degree.transactionHash,
          storedOnChainAt: chainData?.timestamp,
        },
        degree: {
          studentName: storedData.studentName,
          studentId: storedData.studentId,
          program: storedData.program,
          university: storedData.university,
          graduationYear: storedData.graduationYear,
          status: degree.status,
          approvedAt: degree.approvedAt,
        },
      };
    } catch (blockchainError) {
      console.error(`[BLOCKCHAIN ERROR]:`, blockchainError);
      return { valid: false, message: 'Blockchain node query interaction failed ❌' };
    }
  }

  async deleteDegree(id: number) {
    const degree = await this.degreeRepo.findOneBy({ id });
    if (!degree) throw new NotFoundException('Degree not found');
    return this.degreeRepo.remove(degree);
  }

  async getDashboardStats() {
    const total = await this.degreeRepo.count();
    const pending = await this.degreeRepo.count({ where: { status: DegreeStatus.PENDING } });
    const approved = await this.degreeRepo.count({ where: { status: DegreeStatus.APPROVED } });
    const rejected = await this.degreeRepo.count({ where: { status: DegreeStatus.REJECTED } });

    const recentDegrees = await this.degreeRepo.find({
      relations: { student: true },
      order: { id: 'DESC' },
      take: 5,
    });

    return {
      totalCount: total,
      pendingCount: pending,
      approvedCount: approved,
      rejectedCount: rejected,
      recentDegrees: recentDegrees.map(d => ({ ...d, marksheetPath: d.marksheet, pdfPath: d.pdf })),
    };
  }

  async getAuditLog() {
    const allDegrees = await this.degreeRepo.find({
      relations: { student: true },
      order: { id: 'DESC' },
    });

    return allDegrees.map((d) => ({
      degreeId: d.id,
      studentName: d.studentName,
      studentId: d.studentId,
      program: d.program,
      university: d.university,
      status: d.status,
      hasHash: !!d.hash,          
      hasQR: !!d.qrCode,          
      hasPdf: !!d.pdf,            
      hasMarksheet: !!d.marksheet, 
      approvedAt: d.approvedAt ?? null,
      studentEmail: d.student?.email ?? null,
    }));
  }

  async getReport() {
    const total = await this.degreeRepo.count();
    const pending = await this.degreeRepo.count({ where: { status: DegreeStatus.PENDING } });
    const approved = await this.degreeRepo.count({ where: { status: DegreeStatus.APPROVED } });
    const rejected = await this.degreeRepo.count({ where: { status: DegreeStatus.REJECTED } });

    const approvedDegrees = await this.degreeRepo.find({
      where: { status: DegreeStatus.APPROVED },
      relations: { student: true },
      order: { id: 'DESC' },
    });

    const pendingDegrees = await this.degreeRepo.find({
      where: { status: DegreeStatus.PENDING },
      relations: { student: true },
      order: { id: 'DESC' },
    });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDegrees: total,
        pendingRequests: pending,
        approvedDegrees: approved,
        rejectedDegrees: rejected,
        approvalRate: total > 0 ? `${((approved / total) * 100).toFixed(1)}%` : '0%',
      },
      approvedDegrees: approvedDegrees.map((d) => ({
        degreeId: d.id,
        studentName: d.studentName,
        studentId: d.studentId,
        program: d.program,
        university: d.university,
        graduationYear: d.graduationYear,
        approvedAt: d.approvedAt ?? null,
      })),
      pendingDegrees: pendingDegrees.map((d) => ({
        degreeId: d.id,
        studentName: d.studentName,
        studentId: d.studentId,
        program: d.program,
        university: d.university,
      })),
    };
  }
}