import { Test, TestingModule } from '@nestjs/testing';
import { OrgDataController } from './org_data.controller';
import { OrgDataService } from './org_data.service';

describe('OrgDataController', () => {
  let controller: OrgDataController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrgDataController],
      providers: [OrgDataService],
    }).compile();

    controller = module.get<OrgDataController>(OrgDataController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
