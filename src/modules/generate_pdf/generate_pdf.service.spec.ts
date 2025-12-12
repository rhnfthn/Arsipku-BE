import { Test, TestingModule } from '@nestjs/testing';
import { GeneratePdfService } from './generate_pdf.service';

describe('GeneratePdfService', () => {
  let service: GeneratePdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeneratePdfService],
    }).compile();

    service = module.get<GeneratePdfService>(GeneratePdfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
