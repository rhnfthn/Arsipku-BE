import { Test, TestingModule } from '@nestjs/testing';
import { AreasubController } from './areasub.controller';
import { AreasubService } from './areasub.service';

describe('AreasubController', () => {
  let controller: AreasubController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AreasubController],
      providers: [AreasubService],
    }).compile();

    controller = module.get<AreasubController>(AreasubController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
