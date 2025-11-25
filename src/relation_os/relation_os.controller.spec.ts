import { Test, TestingModule } from '@nestjs/testing';
import { RelationOsController } from './relation_os.controller';
import { RelationOsService } from './relation_os.service';

describe('RelationOsController', () => {
  let controller: RelationOsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationOsController],
      providers: [RelationOsService],
    }).compile();

    controller = module.get<RelationOsController>(RelationOsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
