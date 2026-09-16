/* eslint-disable @typescript-eslint/unbound-method */
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../../../common/decorators/require-permission.decorator';
import { TugasBoardService, TugasTaskService } from '../services';
import { TugasController } from './tugas.controller';

interface RouteExpectation {
  method: keyof TugasController;
  path: string;
  requestMethod: RequestMethod;
  permission: RequiredPermission;
}

describe('TugasController contract', () => {
  const routes: RouteExpectation[] = [
    {
      method: 'createBoard',
      path: 'boards',
      requestMethod: RequestMethod.POST,
      permission: { resource: 'tugas', action: 'create-board' },
    },
    {
      method: 'findMyTasks',
      path: 'my-tasks',
      requestMethod: RequestMethod.GET,
      permission: { resource: 'tugas', action: 'read' },
    },
    {
      method: 'moveTask',
      path: 'tasks/:taskId/move',
      requestMethod: RequestMethod.PATCH,
      permission: { resource: 'tugas', action: 'move-task' },
    },
    {
      method: 'removeTask',
      path: 'tasks/:taskId',
      requestMethod: RequestMethod.DELETE,
      permission: { resource: 'tugas', action: 'delete-task' },
    },
  ];

  it.each(routes)(
    '$method mengekspos route dan permission yang tepat',
    (route) => {
      const handler = TugasController.prototype[route.method];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(route.path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        route.requestMethod,
      );
      expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toEqual(
        route.permission,
      );
    },
  );

  it('meneruskan identity JWT utuh ke service, bukan persnum saja', async () => {
    const boardService = {
      findOne: jest.fn(() => Promise.resolve({ status: 'success' })),
    } as unknown as TugasBoardService;
    const taskService = {} as TugasTaskService;
    const controller = new TugasController(boardService, taskService);
    const user = {
      persnum: 10,
      company: '1000',
      position: 'POSITION-1',
    } as never;

    await controller.findBoard('eb780188-ff31-4f60-a472-b46acbcf86ea', user);

    expect(boardService.findOne).toHaveBeenCalledWith(
      'eb780188-ff31-4f60-a472-b46acbcf86ea',
      user,
    );
  });
});
