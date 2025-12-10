import { Test, TestingModule } from '@nestjs/testing';
import { RelationOaService } from './relation_oa.service';

describe('RelationOaService', () => {
  let service: RelationOaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationOaService],
    }).compile();

    service = module.get<RelationOaService>(RelationOaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
