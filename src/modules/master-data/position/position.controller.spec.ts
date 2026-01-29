import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';
import { OmPosition } from './entities/om-position.entity';
import { RelationOs } from '../relation_os/entities/relation_os.entity';
import { RelationOsc } from '../relation_osc/entities/relation_osc.entity';
import { DataSource } from 'typeorm';

describe('PositionController', () => {
  let controller: PositionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PositionController],
      providers: [
        PositionService,
        {
          provide: getRepositoryToken(OmPosition),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RelationOs),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RelationOsc),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PositionController>(PositionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
