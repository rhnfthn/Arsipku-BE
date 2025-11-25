import { Test, TestingModule } from '@nestjs/testing';
import { RelationSpService } from './relation_sp.service';

describe('RelationSpService', () => {
  let service: RelationSpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationSpService],
    }).compile();

    service = module.get<RelationSpService>(RelationSpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
