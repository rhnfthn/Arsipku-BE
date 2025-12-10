import { Test, TestingModule } from '@nestjs/testing';
import { RelationOscService } from './relation_osc.service';

describe('RelationOscService', () => {
  let service: RelationOscService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationOscService],
    }).compile();

    service = module.get<RelationOscService>(RelationOscService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
