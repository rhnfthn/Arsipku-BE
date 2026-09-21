import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AllowViewerWrite } from '../../../common/decorators/allow-viewer-write.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  AddBoardMemberDto,
  AddTaskReferenceDto,
  CreateBoardDto,
  CreateTaskCommentDto,
  CreateTaskDto,
  DeleteTaskCommentScopeDto,
  MoveTaskDto,
  QueryActivityDto,
  QueryBoardDto,
  QueryMemberCandidateDto,
  QueryMyTaskDto,
  QueryTaskCommentDto,
  QueryTaskDto,
  UpdateBoardDto,
  UpdateTaskDto,
} from '../dto';
import {
  TugasBoardService,
  TugasCommentService,
  TugasEvidenceService,
  TugasMemberService,
  TugasReferenceService,
  TugasTaskService,
  TugasTimelineService,
} from '../services';

@Controller('tugas')
@UseGuards(JwtAuthGuard, PermissionGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class TugasController {
  constructor(
    private readonly boardService: TugasBoardService,
    private readonly taskService: TugasTaskService,
    private readonly memberService: TugasMemberService,
    private readonly timelineService: TugasTimelineService,
    private readonly referenceService: TugasReferenceService,
    private readonly evidenceService: TugasEvidenceService,
    private readonly commentService: TugasCommentService,
  ) {}

  @Post('boards')
  @AllowViewerWrite(PositionStatus.VI, PositionStatus.SE)
  createBoard(@Body() dto: CreateBoardDto, @CurrentUser() user: JwtPayload) {
    return this.boardService.create(dto, user);
  }

  @Get('boards')
  @RequirePermission('tugas', 'read-board')
  findBoards(@Query() query: QueryBoardDto, @CurrentUser() user: JwtPayload) {
    return this.boardService.findAll(query, user);
  }

  @Get('my-tasks')
  @RequirePermission('tugas', 'read-my-tasks')
  findMyTasks(@Query() query: QueryMyTaskDto, @CurrentUser() user: JwtPayload) {
    return this.taskService.findMyTasks(query, user);
  }

  /**
   * GET /tugas/member-candidates
   * Pencarian kandidat anggota tanpa board — dipakai form "Buat Papan"
   * (tipe bersama) untuk mengajak anggota sejak awal.
   */
  @Get('member-candidates')
  @RequirePermission('tugas', 'read-board')
  findGlobalMemberCandidates(
    @Query() query: QueryMemberCandidateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.memberService.findGlobalCandidates(query, user);
  }

  @Get('boards/:boardId')
  @RequirePermission('tugas', 'read-board')
  findBoard(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardService.findOne(boardId, user);
  }

  @Patch('boards/:boardId')
  @RequirePermission('tugas', 'update-board')
  updateBoard(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: UpdateBoardDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardService.update(boardId, dto, user);
  }

  @Delete('boards/:boardId')
  @RequirePermission('tugas', 'delete-board')
  removeBoard(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardService.remove(boardId, user);
  }

  @Post('boards/:boardId/restore')
  @RequirePermission('tugas', 'delete-board')
  restoreBoard(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardService.restore(boardId, user);
  }

  @Get('boards/:boardId/member-candidates')
  @RequirePermission('tugas', 'manage-members')
  findMemberCandidates(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Query() query: QueryMemberCandidateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.memberService.findCandidates(boardId, query, user);
  }

  @Post('boards/:boardId/members')
  @RequirePermission('tugas', 'manage-members')
  addBoardMember(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: AddBoardMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.memberService.add(boardId, dto, user);
  }

  @Delete('boards/:boardId/members/:memberId')
  @RequirePermission('tugas', 'manage-members')
  removeBoardMember(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.memberService.remove(boardId, memberId, user);
  }

  @Get('boards/:boardId/activity')
  @RequirePermission('tugas', 'read-board')
  findBoardActivity(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Query() query: QueryActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timelineService.findTimeline(boardId, query, user);
  }

  @Post('boards/:boardId/tasks')
  @RequirePermission('tugas', 'create-task')
  createTask(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.create(boardId, dto, user);
  }

  @Get('boards/:boardId/tasks')
  @RequirePermission('tugas', 'read-board')
  findTasks(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Query() query: QueryTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.findAll(boardId, query, user);
  }

  @Get('tasks/:taskId')
  @RequirePermission('tugas', 'read-board')
  findTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.findOne(taskId, user);
  }

  @Patch('tasks/:taskId')
  @RequirePermission('tugas', 'update-task')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.update(taskId, dto, user);
  }

  @Patch('tasks/:taskId/move')
  @RequirePermission('tugas', 'move-task')
  moveTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: MoveTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.move(taskId, dto, user);
  }

  @Post('tasks/:taskId/archive')
  @RequirePermission('tugas', 'update-task')
  archiveTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.archive(taskId, user);
  }

  @Post('tasks/:taskId/unarchive')
  @RequirePermission('tugas', 'update-task')
  unarchiveTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.unarchive(taskId, user);
  }

  @Delete('tasks/:taskId')
  @RequirePermission('tugas', 'delete-task')
  removeTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.taskService.remove(taskId, user);
  }

  @Get('tasks/:taskId/references')
  @RequirePermission('tugas', 'read-board')
  findTaskReferences(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.referenceService.listByTask(taskId, user);
  }

  @Post('tasks/:taskId/references')
  @RequirePermission('tugas', 'update-task')
  addTaskReference(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AddTaskReferenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.referenceService.add(taskId, dto, user);
  }

  @Delete('tasks/:taskId/references/:referenceId')
  @RequirePermission('tugas', 'update-task')
  removeTaskReference(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('referenceId', ParseUUIDPipe) referenceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.referenceService.remove(taskId, referenceId, user);
  }

  @Get('tasks/:taskId/evidences')
  @RequirePermission('tugas', 'read-board')
  findTaskEvidences(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.list(taskId, user);
  }

  @Post('tasks/:taskId/evidences')
  @RequirePermission('tugas', 'update-task')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
          callback(null, true);
          return;
        }
        callback(
          new BadRequestException('Evidence hanya mendukung file JPG atau PNG'),
          false,
        );
      },
    }),
  )
  addTaskEvidence(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.add(taskId, file, user);
  }

  @Delete('tasks/:taskId/evidences/:evidenceId')
  @RequirePermission('tugas', 'update-task')
  removeTaskEvidence(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.remove(taskId, evidenceId, user);
  }

  // ─── Forum diskusi papan ─────────────────────────────────────────────────────

  /**
   * GET /tugas/boards/:boardId/comments — daftar komentar forum papan.
   * Query opsional taskId untuk filter diskusi yang men-tag task tertentu.
   */
  @Get('boards/:boardId/comments')
  @RequirePermission('tugas', 'read-board')
  findBoardComments(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Query() query: QueryTaskCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.commentService.list(boardId, query, user);
  }

  /** POST /tugas/boards/:boardId/comments — tambah komentar forum papan. */
  @Post('boards/:boardId/comments')
  @RequirePermission('tugas', 'read-board')
  addBoardComment(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.commentService.add(boardId, dto, user);
  }

  /**
   * DELETE /tugas/boards/:boardId/comments/:commentId?scope=me|everyone
   * - scope=me: sembunyikan komentar untuk membership aktif saja.
   * - scope=everyone: hapus permanen (penulis, maks 5 menit setelah kirim).
   */
  @Delete('boards/:boardId/comments/:commentId')
  @RequirePermission('tugas', 'read-board')
  removeBoardComment(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Query() query: DeleteTaskCommentScopeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.commentService.remove(
      boardId,
      commentId,
      query.scope ?? 'me',
      user,
    );
  }
}
