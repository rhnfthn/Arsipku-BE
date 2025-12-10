import { Test, TestingModule } from '@nestjs/testing';
import { RelationOsService } from './relation_os.service';

describe('RelationOsService', () => {
  let service: RelationOsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationOsService],
    }).compile();

    service = module.get<RelationOsService>(RelationOsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
