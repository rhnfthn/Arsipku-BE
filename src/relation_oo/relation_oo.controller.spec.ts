import { Test, TestingModule } from '@nestjs/testing';
import { RelationOoController } from './relation_oo.controller';
import { RelationOoService } from './relation_oo.service';

describe('RelationOoController', () => {
  let controller: RelationOoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationOoController],
      providers: [RelationOoService],
    }).compile();

    controller = module.get<RelationOoController>(RelationOoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
