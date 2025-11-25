import { Test, TestingModule } from '@nestjs/testing';
import { RelationOscController } from './relation_osc.controller';
import { RelationOscService } from './relation_osc.service';

describe('RelationOscController', () => {
  let controller: RelationOscController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationOscController],
      providers: [RelationOscService],
    }).compile();

    controller = module.get<RelationOscController>(RelationOscController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
