import { Test, TestingModule } from '@nestjs/testing';
import { RelationSpController } from './relation_sp.controller';
import { RelationSpService } from './relation_sp.service';

describe('RelationSpController', () => {
  let controller: RelationSpController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationSpController],
      providers: [RelationSpService],
    }).compile();

    controller = module.get<RelationSpController>(RelationSpController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
