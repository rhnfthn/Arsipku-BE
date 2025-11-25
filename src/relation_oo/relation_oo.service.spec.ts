import { Test, TestingModule } from '@nestjs/testing';
import { RelationOoService } from './relation_oo.service';

describe('RelationOoService', () => {
  let service: RelationOoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationOoService],
    }).compile();

    service = module.get<RelationOoService>(RelationOoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
