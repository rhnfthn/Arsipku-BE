import { Test, TestingModule } from '@nestjs/testing';
import { OrgDataService } from './org_data.service';

describe('OrgDataService', () => {
  let service: OrgDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrgDataService],
    }).compile();

    service = module.get<OrgDataService>(OrgDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
