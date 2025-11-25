import { Test, TestingModule } from '@nestjs/testing';
import { RelationOdController } from './relation_od.controller';
import { RelationOdService } from './relation_od.service';

describe('RelationOdController', () => {
  let controller: RelationOdController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationOdController],
      providers: [RelationOdService],
    }).compile();

    controller = module.get<RelationOdController>(RelationOdController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
