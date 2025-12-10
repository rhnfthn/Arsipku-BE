import { Test, TestingModule } from '@nestjs/testing';
import { RelationOdService } from './relation_od.service';

describe('RelationOdService', () => {
  let service: RelationOdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationOdService],
    }).compile();

    service = module.get<RelationOdService>(RelationOdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
