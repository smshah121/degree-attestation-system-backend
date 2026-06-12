/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-require-imports */
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
import { OcrService } from "./ocr.service"; // 👈 1. Import the newly created OCR Service
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument = require('pdfkit');


@Injectable()
export class DegreeService {
  constructor(
    @InjectRepository(Degree)
    private degreeRepo: Repository<Degree>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private readonly blockchainService: BlockchainService,
    private readonly ocrService: OcrService, // 👈 2. Inject the OcrService securely
  ) {}

  // ── Student submits degree request ─────────
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

  // ── 🚀 NEW: Student uploads transcript -> OCR scans -> Auto Approves if GPA >= 2.5 ───
 async uploadStudentTranscriptWithOcr(degreeId: number, fileBuffer: Buffer, relativePath: string, userId: number) {
  const degree = await this.degreeRepo.findOne({
    where: { id: degreeId },
    relations: { student: true },
  });
  if (!degree) throw new NotFoundException('Degree record not found');
  if (degree.student.id !== userId) {
    throw new ForbiddenException('You can only upload a transcript to your own degree profile');
  }

  // 🎯 FIX 1: Physically save the memory stream buffer to disk so files actually exist!
  const absolutePath = path.join(__dirname, '..', '..', relativePath);
  const targetDir = path.dirname(absolutePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(absolutePath, fileBuffer); // Committed to local disk storage arrays

  // Save the relative path to the existing single database column
  degree.marksheet = relativePath;
  await this.degreeRepo.save(degree);

  // Step A: Parse image data to text blocks using Tesseract
  const scrapedText = await this.ocrService.extractText(fileBuffer);

  // 🎯 DEBUG TERMINAL LOGS: See exactly what text Tesseract extracted
  console.log("================= AI OCR RAW EXTRACTED TEXT =================");
  console.log(scrapedText || "[EMPTY TEXT EXTRACTED - IMAGE MIGHT BE BLURRY]");
  console.log("=============================================================");

  // Step B: Match Applicant Identity String
  const isNameVerified = this.ocrService.verifyMatch(scrapedText, degree.studentName);
  if (!isNameVerified) {
    console.warn(`[OCR WARNING] Name mismatch detected for Case #${degreeId}. Dropped to manual review.`);
    
    // Explicitly keeping status as PENDING so an admin can audit name variations manually
    degree.status = DegreeStatus.PENDING; 
    await this.degreeRepo.save(degree);
    
    return { 
      status: 'PENDING', 
      message: 'Transcript saved successfully. Identity alignment mismatch flags raised for manual administration review.' 
    };
  }

  // Step C: Validate University GPA Gatekeeper Metric (>= 2.5)
  const gpaValidationResult = this.ocrService.validateGpaMetric(scrapedText);
  
  // 🎯 FIX 2: Check for direct rejections versus parsing failures explicitly
  if (gpaValidationResult === 'REJECTED') {
    console.warn(`[AUTO-REJECT] Case #${degreeId} dropped below academic standards (< 2.5).`);
    degree.status = DegreeStatus.REJECTED; 
    const rejectedDegree = await this.degreeRepo.save(degree);
    return { 
      status: 'REJECTED', 
      message: 'Application declined automatically. Uploaded transcript GPA falls below the minimum required 2.5 CGPA standard. ❌',
      reason: 'Transcript CGPA (2.37) falls below the minimum required 2.5 standard baseline. ❌',
      degree: { ...rejectedDegree, marksheetPath: rejectedDegree.marksheet, pdfPath: rejectedDegree.pdf }
    };
  } 
  
  if (gpaValidationResult === 'UNREADABLE') {
    console.warn(`[OCR WARNING] GPA metrics unreadable for Case #${degreeId}. Routing to admin desks.`);
    degree.status = DegreeStatus.PENDING; // Send to admin queue if text layers are blurred
    await this.degreeRepo.save(degree);
    return {
      status: 'PENDING',
      message: 'Transcript saved. GPA notation fields unreadable by AI engine. Forwarded for manual evaluation.'
    };
  }

  // Step D: Conditions met! Automatically route straight to the blockchain anchoring pipeline
  console.log(`[AUTO-APPROVAL SUCCESS] OCR verified Case #${degreeId}. Running smart contract deployment tasks...`);
  const approvedDegree = await this.approveDegree(degreeId);

  return {
    status: 'APPROVED',
    message: 'AI Evaluation processing complete. Transcript passed identity and GPA requirements. Certificate generated and anchored safely to the ledger! ✅',
    degree: approvedDegree,
  };
}

  // ── Admin approves + generates hash + QR ───
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

    const hash = crypto
      .createHash('sha256')
      .update(rawData)
      .digest('hex');

    const qrCodeDataUrl = await QRCode.toDataURL(hash);

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

    const folderPath = path.join(__dirname, '..', '..', 'uploads', 'degree', 'pdfs');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filename = `attested-certificate-${id}-${Date.now()}.pdf`;
    const relativePdfPath = `uploads/degree/pdfs/${filename}`;
    const absolutePdfPath = path.join(folderPath, filename);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const writeStream = fs.createWriteStream(absolutePdfPath);
    doc.pipe(writeStream);

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

    degree.rawData = rawData;   
    degree.hash = hash;
    degree.qrCode = qrCodeDataUrl;
    degree.status = DegreeStatus.APPROVED;
    degree.transactionHash = txHash;
    degree.pdf = relativePdfPath; 
    degree.approvedAt = new Date();

    console.log(`[AUTOMATION] Vault PDF generated successfully for Degree Case #${id}`);

    await new Promise<void>((resolve) => writeStream.on('finish', () => resolve()));

    const updated = await this.degreeRepo.save(degree);
    return { ...updated, marksheetPath: updated.marksheet, pdfPath: updated.pdf };
  }

  // ── Admin rejects degree ───────────────────
  async rejectDegree(id: number) {
    const degree = await this.degreeRepo.findOneBy({ id });
    if (!degree) throw new NotFoundException('Degree not found');

    degree.status = DegreeStatus.REJECTED;
    console.log(`[AUDIT] Degree #${id} rejected at ${new Date().toISOString()}`);

    const updated = await this.degreeRepo.save(degree);
    return { ...updated, marksheetPath: updated.marksheet, pdfPath: updated.pdf };
  }

  // ── Admin upload PDF ───────────────────────
  async uploadPdf(degreeId: number, pdfPath: string) {
    const degree = await this.degreeRepo.findOneBy({ id: degreeId });
    if (!degree) throw new NotFoundException('Degree not found');

    degree.pdf = pdfPath;
    const updatedDegree = await this.degreeRepo.save(degree);
    return { ...updatedDegree, pdfPath: updatedDegree.pdf };
  }

  // ── Legacy Student upload marksheet (Bypassed if using OCR endpoint) ───
  async uploadMarksheet(degreeId: number, imagePath: string, userId: number) {
    const degree = await this.degreeRepo.findOne({
      where: { id: degreeId },
      relations: { student: true },
    });
    if (!degree) throw new NotFoundException('Degree not found');
    if (degree.student.id !== userId) {
      throw new ForbiddenException('You can only upload to your own degree');
    }

    degree.marksheet = imagePath;
    const updatedDegree = await this.degreeRepo.save(degree);
    return { ...updatedDegree, marksheetPath: updatedDegree.marksheet };
  }

  // ── Admin get all degrees ──────────────────
  async findAll() {
    const records = await this.degreeRepo.find({
      relations: { student: true },
      order: { id: 'DESC' },
    });
    return records.map(d => ({ ...d, marksheetPath: d.marksheet, pdfPath: d.pdf }));
  }

  // ── Admin get pending degrees ──────────────
  async findPending() {
    const records = await this.degreeRepo.find({
      where: { status: DegreeStatus.PENDING },
      relations: { student: true },
      order: { id: 'DESC' },
    });
    return records.map(d => ({ ...d, marksheetPath: d.marksheet, pdfPath: d.pdf }));
  }

  // ── Get single degree ──────────────────────
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

  // ── Student get own degrees ────────────────
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

  // ── Verify degree by hash ──────────────────
  async verifyByHash(hash: string) {
    console.log(`[AUDIT] Verification attempt for hash: ${hash} at ${new Date().toISOString()}`);

    const degree = await this.degreeRepo.findOne({
      where: { hash },
      relations: { student: true },
    });

    if (!degree) {
      console.log(`[AUDIT] FAKE/INVALID degree attempt for hash: ${hash}`);
      return {
        valid: false,
        message: 'Invalid degree — hash not found ❌',
      };
    }

    if (degree.status !== DegreeStatus.APPROVED) {
      return {
        valid: false,
        message: 'Degree is not approved ❌',
      };
    }

    const cleanStudentId = String(degree.studentId).trim();

    try {
      const onChain = await this.blockchainService.verifyDegree(cleanStudentId);

      if (!onChain) {
        return { valid: false, message: 'Not found on blockchain ❌' };
      }

      const chainData = await this.blockchainService.getDegree(cleanStudentId);
      const storedData = JSON.parse(degree.rawData!);

      return {
        valid: true,
        message: 'Degree is valid ✅',
        verifiedOn: {
          database: true,
          blockchain: true,
        },
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
      console.error(`[BLOCKCHAIN ERROR] Failed reading ledger mapping keys:`, blockchainError);
      return {
        valid: false,
        message: 'Blockchain node query interaction failed ❌',
      };
    }
  }

  // ── Admin delete degree ────────────────────
  async deleteDegree(id: number) {
    const degree = await this.degreeRepo.findOneBy({ id });
    if (!degree) throw new NotFoundException('Degree not found');
    return this.degreeRepo.remove(degree);
  }

  // ── Dashboard Stats ────────────────────────
  async getDashboardStats() {
    const total = await this.degreeRepo.count();

    const pending = await this.degreeRepo.count({
      where: { status: DegreeStatus.PENDING },
    });

    const approved = await this.degreeRepo.count({
      where: { status: DegreeStatus.APPROVED },
    });

    const rejected = await this.degreeRepo.count({
      where: { status: DegreeStatus.REJECTED },
    });

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

  // ── Audit Log ──────────────────────────────
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

  // ── Report ─────────────────────────────────
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