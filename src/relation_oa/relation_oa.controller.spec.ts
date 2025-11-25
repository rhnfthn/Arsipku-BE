import { Test, TestingModule } from '@nestjs/testing';
import { RelationOaController } from './relation_oa.controller';
import { RelationOaService } from './relation_oa.service';

describe('RelationOaController', () => {
  let controller: RelationOaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationOaController],
      providers: [RelationOaService],
    }).compile();

    controller = module.get<RelationOaController>(RelationOaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
