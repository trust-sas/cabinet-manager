import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @RequirePermission('documents', 'create')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body('dossierId') dossierId?: string,
    @Body('typeDocument') typeDocument?: string,
    @Body('description') description?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.uploadDocument(
      file,
      dossierId ? parseInt(dossierId, 10) : undefined,
      typeDocument,
      description,
      user,
    );
  }

  @RequirePermission('documents', 'read')
  @Get('recherche')
  rechercheFullText(
    @Query('q') query: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.rechercheFullText(query, user);
  }

  @RequirePermission('documents', 'read')
  @Get('permissions/mes-demandes')
  getPermissionsForUser(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getPermissionsForUser(user);
  }

  @RequirePermission('documents', 'read')
  @Get(':id/access-status')
  getAccessStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getAccessStatus(id, user);
  }

  @RequirePermission('documents', 'read')
  @Post(':id/demander-acces')
  demanderAcces(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.demanderAcces(id, user);
  }

  @RequirePermission('documents', 'read')
  @Post('permissions/:permissionId/repondre')
  repondreDemandeAcces(
    @Param('permissionId', ParseIntPipe) permissionId: number,
    @Body('autoriser') autoriser: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.repondreDemandeAcces(permissionId, autoriser, user);
  }

  @RequirePermission('documents', 'read')
  @Get(':id/download')
  async downloadFile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { buffer, document } = await this.svc.telechargerDocument(id, user);
    const mime = this.getMimeForDoc(document.nom);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.nom)}"`);
    res.send(buffer);
  }

  private getMimeForDoc(nom: string): string {
    const lower = (nom || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
    return 'application/octet-stream';
  }

  @RequirePermission('documents', 'create')
  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(dto, user);
  }

  @RequirePermission('documents', 'read')
  @Get()
  findAll(@Query() query: QueryDocumentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findAll(query, user);
  }

  @RequirePermission('documents', 'read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findOne(id, user);
  }

  @RequirePermission('documents', 'update')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @RequirePermission('documents', 'update')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.remove(id, user);
  }
}
