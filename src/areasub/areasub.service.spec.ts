import { Test, TestingModule } from '@nestjs/testing';
import { AreasubService } from './areasub.service';

describe('AreasubService', () => {
  let service: AreasubService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AreasubService],
    }).compile();

    service = module.get<AreasubService>(AreasubService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
